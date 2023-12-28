import axios from 'axios';
import * as child_process from 'child_process';

export interface CommitData {
    title: string;
    body: string;
}

export class GitHubService {
    private githubToken: string | undefined = process.env.GITHUB_ACCESS_TOKEN;

    constructor() {
        if (!this.githubToken) {
            throw new Error('No GitHub access token');
        }
    }

    private async getGitRemoteInfo(): Promise<{ owner: string; repo: string }> {
        const gitRemoteOutput = child_process.execSync('git remote get-url origin').toString().trim();
        const match = gitRemoteOutput.match(/github\.com[:\/](.*?)\/(.*?)\.git/);
        if (!match || match.length < 3) {
            throw new Error('Failed to parse GitHub remote URL');
        }
        const [, owner, repo] = match;
        return { owner, repo };
    }

    public async createOrUpdatePullRequest(branchName: string, prText: CommitData, targetBranch: string): Promise<void> {
        const existingPRNumber = await this.getExistingPullRequest(branchName, targetBranch);

        if (existingPRNumber) {
            await this.updatePullRequest(existingPRNumber, prText);
        } else {
            await this.createPullRequest(branchName, prText, targetBranch);
        }
    }

    private async getExistingPullRequest(branchName: string, targetBranch: string): Promise<number | undefined> {
        const { owner, repo } = await this.getGitRemoteInfo();
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

        const config = {
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            params: {
                state: 'open',
                head: `${owner}:${branchName}`,
                base: targetBranch,
            },
        };

        const response = await axios.get(url, config);

        if (response.data.length > 0) {
            return response.data[0].number; // Return the PR number if it exists
        }

        return undefined;
    }

    private async updatePullRequest(prNumber: number, prText: CommitData): Promise<void> {
        const { owner, repo } = await this.getGitRemoteInfo();
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

        const requestBody = {
            ...prText,
        };

        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        };

        const response = await axios.patch(url, requestBody, config);

        if (response.status !== 200) {
            console.log(response.data.errors);
            throw new Error('Failed to update pull request');
        }

        console.log('Pull request updated successfully!');
    }

    private async createPullRequest(branchName: string, prText: CommitData, targetBranch: string = 'master'): Promise<void> {
        const { owner, repo } = await this.getGitRemoteInfo();
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

        const requestBody = {
            ...prText,
            head: branchName,
            base: targetBranch,
        };

        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        };

        const response = await axios.post(url, requestBody, config);

        if (response.status !== 201) {
            console.log(response.data.errors);
            throw new Error('Failed to create pull request');
        }

        console.log('Pull request created successfully!');
    }


}