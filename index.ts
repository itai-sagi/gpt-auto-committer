import axios from 'axios';
import * as child_process from 'child_process';
import fetch from 'node-fetch';
import { OpenAI } from "openai";

const jiraEmail = process.env.JIRA_EMAIL;
const jiraToken = process.env.JIRA_API_KEY;
const jiraDomain = process.env.JIRA_DOMAIN;
const githubToken = process.env.GITHUB_ACCESS_TOKEN;

if (!process.env.OPENAI_API_KEY) {
    throw new Error("no open ai api key")
}

const openai = new OpenAI();

const jiraIssueId = process.argv[2]; // Optional JIRA issue ID provided as an argument.
const shouldOpenPR = process.argv.includes('--open-pr');
const isForce = process.argv.includes('--force');

console.log(`Running for Jira Issue: ${jiraIssueId}`);
console.log(`Should open a PR: ${shouldOpenPR}`);
if (shouldOpenPR && !githubToken) {
    throw new Error("no github access token");
}

function execShellCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

async function getJiraIssue(issueId: string): Promise<string> {
    const url = `https://${jiraDomain}.atlassian.net/rest/api/2/issue/${issueId}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
            'Accept': 'application/json',
        }
    });
    const data = await response.json();
    return `Jire Ticket ID: ${issueId}\n${data.fields.summary}\n${data.fields.description}, link: https://${jiraDomain}.atlassian.net/browse/${issueId}`;
}

async function generatePullRequestDescription(diff: string, jiraContent?: string): Promise<{ title: string, body: string }> {
    const prompt = `
        Please create a description for the Pull Request based on the following changes:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''} 
        
        Guidelines:
            1. Description should be in markdown format
            2. If jira issue exists, add a link to it.
            3. Outline major changes in the diff and try to reason them
            4. Use emojis where appropriate to bring the description to life
            5. at the end of the PR add a snazzy and a little sarcastic marketing message to advertise the tool "gpt-auto-committer", it should include a link to https://github.com/itai-sagi/gpt-auto-comitter
            
            the response should be json and adhere to the following structure:   
            
            interface CommitData { title: string, body: string }
    `;

    const gptResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [{
            content: prompt,
            role: "user"
        }],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
    });

    const response = JSON.parse(gptResponse.choices[0].message.content || '{}') as { title: string, body: string };
    console.log(response);

    return response
}

function getGitRemoteInfo(): { owner: string, repo: string } {
    const gitRemoteOutput = child_process.execSync('git remote get-url origin').toString().trim();
    const match = gitRemoteOutput.match(/github\.com[:\/](.*?)\/(.*?)\.git/);
    if (!match || match.length < 3) {
        throw new Error('Failed to parse GitHub remote URL');
    }
    const [, owner, repo] = match;
    return { owner, repo };
}


async function createPullRequest(branchName: string, prText: { title: string, body: string }, targetBranch: string = 'master'): Promise<void> {
    const { owner, repo } = getGitRemoteInfo();

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
            'Authorization': `Bearer ${githubToken}`,
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
async function generateCommitMessage(diff: string, jiraContent?: string): Promise<string> {
    const prompt = `
        Please create a commit message for the following diff of a Git repository:\n\n${diff}\n${jiraContent ? '\nAdditional context from JIRA:' + jiraContent : ''}
        it should adhere to conventional commits, so determine if it's a feat, fix, chore or otherwise.
    `;

    const gptResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [{
            content: prompt,
            role: "user"
        }],
        max_tokens: 2500,
        n: 1,
        stop: ["\n"]
    });

    return gptResponse.choices[0].message.content || '';
}

async function commitChanges(commitMessage: string): Promise<void> {
    await execShellCommand('git add .');
    await execShellCommand(`git commit -m "${commitMessage}"`);
    await execShellCommand(`git push origin HEAD ${isForce ? '-f' : ''}`);
}
function getCurrentBranch(): string {
    return child_process.execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

const currentBranch = getCurrentBranch();

(async () => {
    try {
        const diff = await execShellCommand('git diff HEAD');

        let jiraContent = '';
        if (jiraIssueId) {
            jiraContent = await getJiraIssue(jiraIssueId);
        }

        const commitMessage = await generateCommitMessage(diff, jiraContent);

        try {
            await commitChanges(commitMessage);
        } catch (ex) {
            console.error("Didn't commit changes")
        }

        if (shouldOpenPR) {
            const prText = await generatePullRequestDescription(diff, jiraContent);

            await createPullRequest(currentBranch, prText);
        }
        console.log('Changes committed and pushed successfully!');
    } catch (error) {
        console.error('Error:', error);
    }
})();