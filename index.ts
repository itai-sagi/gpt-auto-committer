import axios from 'axios';
import * as child_process from 'child_process';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';
import {CommitData, GitHubService} from "./github";



class GPTAutoCommitter {
    private jiraEmail: string | undefined = process.env.JIRA_EMAIL;
    private jiraToken: string | undefined = process.env.JIRA_API_KEY;
    private jiraDomain: string | undefined = process.env.JIRA_DOMAIN;
    private githubToken: string | undefined = process.env.GITHUB_ACCESS_TOKEN;

    private openai: OpenAI;
    private githubService: GitHubService;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('No OpenAI API key');
        }
        this.openai = new OpenAI();
        this.githubService = new GitHubService();
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
        console.log(issueId);
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

    private async generatePullRequestDescription(diff: string, jiraContent?: string): Promise<CommitData> {
        const prompt = `
        You are a SW Developer, Please create a description for the Pull Request based on the following changes:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''} 
        
        Guidelines:
            1. Description should be in markdown format
            2. Outline major changes in the diff and try to reason them
            3. Use emojis where appropriate to bring the description to life
            4. At the end of the PR add a little sarcastic marketing message with the link https://github.com/itai-sagi/gpt-auto-committer & saying that this PR was created by GPT Auto Committer
            ${jiraContent ? '5. Add a jira link to the issue' : ''}
            the response should be json and adhere to the following structure:   
            
            interface CommitData { title: string, body: string }
    `;

        const gptResponse = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo-1106',
            messages: [{
                content: prompt,
                role: 'user',
            }],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
        });

        const response = JSON.parse(gptResponse.choices[0].message.content || '{}') as CommitData;
        console.log(response);

        return response;
    }

    private async generateCommitMessage(diff: string, jiraContent?: string): Promise<string> {
        const prompt = `
        You are a SW Developer, craft a commit message for the following diff of a Git repository:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''}
        it should adhere to conventional commits, so determine if it's a feat, fix, chore, or otherwise.
        the commit message should be relevant to the files committed while referencing the JIRA Issue's content if its' applicable.
        The commit message should explain the changes to the best of your ability.
    `;

        const gptResponse = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo-1106',
            messages: [{
                content: prompt,
                role: 'user',
            }],
            max_tokens: 2500,
            n: 1,
            stop: ['\n'],
        });

        return gptResponse.choices[0].message.content || '';
    }

    private async commitChanges(commitMessage: string): Promise<void> {
        await this.execShellCommand('git add .');
        await this.execShellCommand(`git commit -m "${commitMessage}"`);
        await this.execShellCommand(`git push origin HEAD ${process.argv.includes('--force') ? '-f' : ''}`);
    }

    private getCurrentBranch(): string {
        return child_process.execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    }

    public async run(): Promise<void> {
        const jiraIssueId = process.argv[2].startsWith('--') ? null : process.argv[2]; // Optional JIRA issue ID provided as an argument.
        const shouldUpdatePullRequest = process.argv.includes('--update-pr');

        console.log(`Running for Jira Issue: ${jiraIssueId}`);
        console.log(`Should create/update a PR: ${shouldUpdatePullRequest}`);

        if (shouldUpdatePullRequest && !this.githubToken) {
            throw new Error('No GitHub access token');
        }

        try {
            const diff = await this.execShellCommand('git diff HEAD');

            let jiraContent = '';
            if (jiraIssueId) {
                jiraContent = await this.getJiraIssue(jiraIssueId);
            }

            const commitMessage = await this.generateCommitMessage(diff, jiraContent);

            try {
                await this.commitChanges(commitMessage);
            } catch (ex) {
                console.error("Didn't commit changes");
            }

            if (shouldUpdatePullRequest) {
                const diff = await this.execShellCommand(`git diff HEAD ${this.getCurrentBranch()}`);

                const prText = await this.generatePullRequestDescription(diff, jiraContent);

                await this.githubService.createOrUpdatePullRequest(this.getCurrentBranch(), prText);
            }
            console.log('Changes committed and pushed successfully!');
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

const autoCommitter = new GPTAutoCommitter();
autoCommitter.run();
