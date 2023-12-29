import axios from 'axios';
import * as child_process from 'child_process';

export interface ChangeRequestData {
    title: string;
    body: string;
}

export interface GitInfo {
    owner: string;
    repo: string;
}

export class GitHubService {
    private githubToken: string | undefined = process.env.GITHUB_ACCESS_TOKEN;
    private gitInfo: GitInfo | undefined;
    private initialized: boolean = false;

    constructor() {
        if (!this.githubToken) {
            throw new Error('No GitHub access token');
        }
        this.initializeGitInfo(); // Initialize gitInfo upon instantiation
    }

    private async initializeGitInfo() {
        if (!this.initialized) {
            const gitRemoteOutput = child_process.execSync('git remote get-url origin').toString().trim();
            const match = gitRemoteOutput.match(/github\.com[:\/](.*?)\/(.*?)\.git/);
            if (!match || match.length < 3) {
                throw new Error('Failed to parse GitHub remote URL');
            }
            const [, owner, repo] = match;
            this.gitInfo = { owner, repo };
            this.initialized = true;
        }
    }

    public async createOrUpdatePullRequest(branchName: string, prText: ChangeRequestData, targetBranch: string): Promise<string> {
        await this.ensureGitInfoInitialized(); // Ensuring gitInfo is ready before execution

        if (branchName === targetBranch) {
            throw new Error("Can't open a PR for the same branches");
        }

        const existingPRNumber = await this.getExistingPullRequest(branchName, targetBranch);

        if (existingPRNumber) {
            return this.updatePullRequest(existingPRNumber, prText);
        }

        return this.createPullRequest(branchName, prText, targetBranch);
    }

    private async getExistingPullRequest(branchName: string, targetBranch: string): Promise<number | undefined> {
        const { owner, repo } = this.gitInfo!;
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

        const config = {
            headers: this.headers,
            params: {
                state: 'open',
                head: `${owner}:${branchName}`,
                base: targetBranch,
            },
        };

        const response = await axios.get(url, config);
        const existingPR = response.data[0];

        return existingPR ? existingPR.number : undefined;
    }

    private async updatePullRequest(prNumber: number, prText: ChangeRequestData): Promise<string> {
        const { owner, repo } = this.gitInfo!;
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

        const requestBody = prText;
        const config = { headers: this.headers };

        const response = await axios.patch(url, requestBody, config);

        if (response.status !== 200) {
            throw new Error('Failed to update the pull request');
        }

        console.log('Pull request updated successfully!');
        return this.getPullRequestLink(prNumber);
    }

    private async createPullRequest(branchName: string, prText: ChangeRequestData, targetBranch: string): Promise<string> {
        const { owner, repo } = this.gitInfo!;
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

        const requestBody = {
            ...prText,
            head: branchName,
            base: targetBranch,
        };

        const config = {
            headers: this.headers,
        };

        const response = await axios.post(url, requestBody, config);

        if (response.status !== 201) {
            throw new Error('Failed to create the pull request');
        }

        console.log('Pull request created successfully!');
        return this.getPullRequestLink(response.data.number);
    }

    private get headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
        };
    }

    private getPullRequestLink(prNumber: number): string {
        const { owner, repo } = this.gitInfo!;
        return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
    }

    private async ensureGitInfoInitialized() {
        if (!this.initialized) {
            await this.initializeGitInfo();
        }
    }
}
