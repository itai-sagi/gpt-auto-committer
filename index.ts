import axios from 'axios';
import * as child_process from 'child_process';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';

interface CommitData {
    title: string;
    body: string;
}

class GPTAutoCommitter {
    private jiraEmail: string | undefined = process.env.JIRA_EMAIL;
    private jiraToken: string | undefined = process.env.JIRA_API_KEY;
    private jiraDomain: string | undefined = process.env.JIRA_DOMAIN;
    private githubToken: string | undefined = process.env.GITHUB_ACCESS_TOKEN;

    private openai: OpenAI;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('No OpenAI API key');
        }
        this.openai = new OpenAI();
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
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${this.jiraEmail}:${this.jiraToken}`).toString('base64')}`,
                'Accept': 'application/json',
            },
        });
        const data = await response.json();
        return `Jire Ticket ID: ${issueId}\n${data.fields.summary}\n${data.fields.description}, link: https://${this.jiraDomain}.atlassian.net/browse/${issueId}`;
    }

    private async generatePullRequestDescription(diff: string, jiraContent?: string): Promise<CommitData> {
        const prompt = `
        Please create a description for the Pull Request based on the following changes:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''} 
        
        Guidelines:
            1. Description should be in markdown format
            2. If jira issue exists, add a link to it.
            3. Outline major changes in the diff and try to reason them
            4. Use emojis where appropriate to bring the description to life
            5. at the end of the PR add a snazzy and a little sarcastic marketing message to advertise the tool "gpt-auto-committer", it should include a link to https://github.com/itai-sagi/gpt-auto-committer
            
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

    private async getGitRemoteInfo(): Promise<{ owner: string, repo: string }> {
        const gitRemoteOutput = child_process.execSync('git remote get-url origin').toString().trim();
        const match = gitRemoteOutput.match(/github\.com[:\/](.*?)\/(.*?)\.git/);
        if (!match || match.length < 3) {
            throw new Error('Failed to parse GitHub remote URL');
        }
        const [, owner, repo] = match;
        return { owner, repo };
    }

    private async createPullRequest(branchName: string, prText: CommitData, targetBranch: string = 'master'): Promise<void> {
        const { owner, repo } = await this.getGitRemoteInfo();

        const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

        const requestBody = {
            ...prText,
            head: branchName,
            base: targetBranch,
        };

        console.log(requestBody);
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.githubToken}`,
                'Accept': 'application/vnd.github.v3+json', // Updated GitHub API version
            },
        };

        const response = await axios.post(url, requestBody, config);

        if (response.status !== 201) {
            console.log(response.data.errors);
            throw new Error('Failed to create pull request');
        }

        console.log('Pull request created successfully!');
    }

    private async generateCommitMessage(diff: string, jiraContent?: string): Promise<string> {
        const prompt = `
        Please create a commit message for the following diff of a Git repository:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''}
        it should adhere to conventional commits, so determine if it's a feat, fix, chore, or otherwise.
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
        const jiraIssueId = process.argv[2]; // Optional JIRA issue ID provided as an argument.
        const shouldOpenPR = process.argv.includes('--open-pr');

        console.log(`Running for Jira Issue: ${jiraIssueId}`);
        console.log(`Should open a PR: ${shouldOpenPR}`);

        if (shouldOpenPR && !this.githubToken) {
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

            if (shouldOpenPR) {
                const prText = await this.generatePullRequestDescription(diff, jiraContent);

                await this.createPullRequest(this.getCurrentBranch(), prText);
            }
            console.log('Changes committed and pushed successfully!');
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

const autoCommitter = new GPTAutoCommitter();
autoCommitter.run();
