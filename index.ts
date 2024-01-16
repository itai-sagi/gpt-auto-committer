import * as child_process from 'child_process';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';
import {ChangeRequestData, GitHubService} from "./github";
import * as fs from "fs";
import * as Handlebars from 'handlebars';


function compileHandlebars(pathToHbs: string) {
    const source = fs.readFileSync(pathToHbs, 'utf8');
    return Handlebars.compile(source);

}

class GPTAutoCommitter {
    private jiraEmail: string | undefined = process.env.JIRA_EMAIL;
    private jiraToken: string | undefined = process.env.JIRA_API_KEY;
    private jiraDomain: string | undefined = process.env.JIRA_DOMAIN;
    private githubToken: string | undefined = process.env.GITHUB_ACCESS_TOKEN;
    private model: string = process.env.OPENAI_MODEL || 'gpt-3.5-turbo-1106';

    private openai: OpenAI;
    private githubService: GitHubService;
    private templates: {
        prDescription: HandlebarsTemplateDelegate<any>,
        commitMessage: HandlebarsTemplateDelegate<any>,
    };

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('No OpenAI API key');
        }
        this.openai = new OpenAI();
        this.githubService = new GitHubService();
        this.templates = {
            prDescription: compileHandlebars(`${__dirname}/prompts/pullRequestDescription.hbs`),
            commitMessage: compileHandlebars(`${__dirname}/prompts/commitMessage.hbs`)
        };

    }

    public async run(): Promise<void> {
        const jiraIssueId = (process.argv[2] || '').startsWith('--') ? null : process.argv[2]; // Optional JIRA issue ID provided as an argument.
        const shouldUpdatePullRequest = process.argv.includes('--update-pr');
        const versionFlagIndex = process.argv.findIndex((arg:string) => arg.startsWith('--version'));
        const branchIndex = process.argv.findIndex((arg:string) => arg.startsWith('--branch='));

        let versionBump = undefined;
        let newBranch = undefined;
        if (versionFlagIndex !== -1) {
            versionBump = process.argv[versionFlagIndex].split('=')[1] || 'patch';
        }
        if (branchIndex !== -1) {
            newBranch = process.argv[branchIndex].split('=')[1]
        }
        const headBranch = (await this.execShellCommand("git remote show origin | awk '/HEAD branch/ {print $NF}'")).toString().trim();
        newBranch = newBranch || (jiraIssueId && this.getCurrentBranch() === headBranch ? jiraIssueId : null);

        console.log(`Running for Jira Issue: ${jiraIssueId || 'N/A'}`);
        console.log(`Should create/update a PR: ${shouldUpdatePullRequest || 'No'}`);
        console.log(`Should bump to version: ${versionBump || 'No'}`);
        console.log(`Switching to a new branch: ${newBranch || 'No'}`);

        if (shouldUpdatePullRequest && !this.githubToken) {
            throw new Error('No GitHub access token');
        }

        try {
            let jiraContent = '';
            if (jiraIssueId) {
                jiraContent = await this.getJiraIssue(jiraIssueId!);
            }

            if (newBranch) {
                await this.execShellCommand(`git checkout -b ${newBranch}`);
            }

            if (versionBump){
                await this.execShellCommand(`npm --no-git-tag-version version ${versionBump}`);
            }

            await this.commitChangesIfNeeded(jiraContent);

            if (shouldUpdatePullRequest) {

                const updatedDiff = await this.execShellCommand(`git diff ${headBranch} ${this.getCurrentBranch()}`);

                const prText = await this.generatePullRequestDescription(updatedDiff, jiraContent);

                const prLink = await this.githubService.createOrUpdatePullRequest(this.getCurrentBranch(), prText, headBranch);
                console.log(`Link to the PR -> ${prLink}`);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    private async commitChangesIfNeeded(jiraContent: string): Promise<void> {
        const diff = await this.execShellCommand('git diff HEAD');

        if (!diff.trim()) {
            await this.pushChanges();
            console.log('No changes to commit.');
            return;
        }

        const commitData = await this.generateCommitMessage(diff, jiraContent);

        try {
            await this.commitChanges(commitData.message);
            console.log('Changes committed and pushed successfully!');
        } catch (ex) {
            console.error(`Failed to commit changes - ${ex}`);
        }
    }



    private async execShellCommand(cmd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            child_process.exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                }
                resolve(stdout ? stdout : stderr);
            });
        });
    }

    private async getJiraIssue(issueId: string): Promise<string> {
        const url = `https://${this.jiraDomain}.atlassian.net/rest/api/2/issue/${issueId}`;
        const auth = `Basic ${Buffer.from(`${this.jiraEmail}:${this.jiraToken}`).toString('base64')}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': auth,
                'Accept': 'application/json',
            },
        });
        const data = await response.json();
        if (response.status > 299) {
            throw new Error(`Failed getting jira issue: ${response.body}`)
        }
        return `Jire Ticket ID: ${issueId}\n${data.fields.summary}\n${data.fields.description}, link: https://${this.jiraDomain}.atlassian.net/browse/${issueId}`;
    }

    private async generateOpenAIResponse<T>(prompt: string, maxTokens: number): Promise<T> {
        const gptResponse = await this.openai.chat.completions.create({
            model: this.model,
            messages: [{
                content: prompt,
                role: 'user',
            }],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
        });

        const content = gptResponse.choices[0].message.content || '{}';

        try {
            return JSON.parse(content) as T;
        } catch (ex) {
            console.log(content);
            throw ex;
        }
    }

    private async generatePullRequestDescription(diff: string, jiraContent?: string): Promise<ChangeRequestData> {
        const prompt= this.templates.prDescription({ diff, jiraContent });

        return await this.generateOpenAIResponse<ChangeRequestData>(prompt, 2500);

    }

    private async generateCommitMessage(diff: string, jiraContent?: string): Promise<{ message: string }> {
        const prompt= this.templates.commitMessage({ diff, jiraContent });

        return await this.generateOpenAIResponse<{ message: string }>(prompt, 2500);
    }

    private async commitChanges(commitMessage: string): Promise<void> {
        await this.execShellCommand('git add -u');
        await this.execShellCommand(`git commit -m "${commitMessage}"`);
        await this.execShellCommand(`git push origin HEAD ${process.argv.includes('--force') ? '-f' : ''}`);
    }

    private getCurrentBranch(): string {
        return child_process.execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    }


    private async pushChanges() {
        await this.execShellCommand(`git push origin HEAD ${process.argv.includes('--force') ? '-f' : ''}`);
    }
}

const autoCommitter = new GPTAutoCommitter();
autoCommitter.run();
