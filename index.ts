#!/usr/bin/env ts-node --loader ts-node/esm

import * as child_process from 'child_process';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';
import {ChangeRequestData, GitHubService} from "./github";
import * as fs from "fs";
import * as Handlebars from 'handlebars';

interface JiraIssue {
    fields: {
        summary: string;
        description: string;
    };
}

function compileHandlebars(pathToHbs: string) {
    const source = fs.readFileSync(pathToHbs, 'utf8');
    return Handlebars.compile(source);

}

class GPTAutoCommitter {
    private openai: OpenAI;
    private templates: {
        prDescription: HandlebarsTemplateDelegate<any>,
        commitMessage: HandlebarsTemplateDelegate<any>,
    };

    constructor() {
        const profileOptionIndex = process.argv.findIndex((arg: string) => arg.startsWith('--profile='));
        const profileName = profileOptionIndex !== -1 ? process.argv[profileOptionIndex].split('=')[1] : 'default';
        if (profileName !== 'default') {
            this.loadProfileFromPath(`${process.env.HOME}/.gac/profile`, 'default');
        }
        this.loadProfileFromPath(`${process.env.HOME}/.gac/profile`, profileName);

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('No OpenAI API key');
        }
        this.openai = new OpenAI();
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
                if (!this.githubToken) {
                    throw new Error('No GitHub access token');
                }

                const updatedDiff = await this.execShellCommand(`git diff ${headBranch} ${this.getCurrentBranch()} -- . ':(exclude)package-lock.json'`);

                const prText = await this.generatePullRequestDescription(updatedDiff, jiraContent);

                const prLink = await new GitHubService(this.githubToken).createOrUpdatePullRequest(this.getCurrentBranch(), prText, headBranch);
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
        const data = await response.json() as JiraIssue;
        if (response.status > 299) {
            throw new Error(`Failed getting jira issue: ${response.body}`)
        }
        return `Jire Ticket ID: ${issueId}\n${data.fields.summary}\n${data.fields.description}, link: https://${this.jiraDomain}.atlassian.net/browse/${issueId}`;
    }

    private loadProfileFromPath(profilePath: string, profileName: string = 'default'): void {
        try {
            const profileData = fs.readFileSync(profilePath, 'utf8');
            const profiles = this.parseIniFile(profileData);

            const selectedProfile = profiles[profileName];

            if (!selectedProfile) {
                console.error(`Profile '${profileName}' not found in ${profilePath}.`);
                return;
            }

            this.setEnvVariableFromProfile('JIRA_EMAIL', selectedProfile.jiraEmail);
            this.setEnvVariableFromProfile('JIRA_API_KEY', selectedProfile.jiraApiKey);
            this.setEnvVariableFromProfile('JIRA_DOMAIN', selectedProfile.jiraDomain);
            this.setEnvVariableFromProfile('GITHUB_ACCESS_TOKEN', selectedProfile.githubAccessToken);
            this.setEnvVariableFromProfile('OPENAI_API_KEY', selectedProfile.openaiApiKey);
            this.setEnvVariableFromProfile('OPENAI_MODEL', selectedProfile.openaiModel, 'gpt-3.5-turbo-1106');

            console.log(`Profile configuration for '${profileName}' loaded from ${profilePath}.`);
        } catch (error) {
            console.error(`Error loading profile configuration from ${profilePath}:`, error);
        }
    }

    private setEnvVariableFromProfile(key: string, profileValue: string | undefined, defaultValue?: string): void {
        process.env[key] = profileValue || process.env[key] || defaultValue || '';
    }

    private parseIniFile(data: string): Record<string, Record<string, string>> {
        const lines = data.split('\n');
        let currentSection: string | null = null;
        const result: Record<string, Record<string, string>> = {};

        lines.forEach((line) => {
            const sectionMatch = line.match(/^\[([^\]]+)\]/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                result[currentSection] = {};
            } else if (currentSection) {
                const keyValueMatch = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
                if (keyValueMatch) {
                    const key = keyValueMatch[1].trim();
                    const value = keyValueMatch[2].trim();
                    result[currentSection][key] = value;
                }
            }
        });

        return result;
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

    get jiraEmail(): string | undefined {
        return this.getEnvVariable('JIRA_EMAIL');
    }

    get jiraToken(): string | undefined {
        return this.getEnvVariable('JIRA_API_KEY');
    }

    get jiraDomain(): string | undefined {
        return this.getEnvVariable('JIRA_DOMAIN');
    }

    get githubToken(): string {
        const token = this.getEnvVariable('GITHUB_ACCESS_TOKEN');

        return token as string;
    }

    get model(): string {
        return this.getEnvVariable('OPENAI_MODEL', 'gpt-3.5-turbo-1106') as string;
    }

    private getEnvVariable(key: string, defaultValue?: string): string | undefined {
        return process.env[key] || defaultValue;
    }
}

const autoCommitter = new GPTAutoCommitter();
autoCommitter.run();
