# GPTAutoCommitter

## Overview
The `GPTAutoCommitter` is a script designed to automate commit creation and pull request updates based on Jira issues. It utilizes the OpenAI GPT model to generate commit messages and pull request descriptions, as-well as automating other ops.

## Prerequisites
Before using this script, ensure you have the following:

- Node.js installed (with npm)
- An OpenAI access key
- GitHub account and personal access token (if creating PRs)
- Access to a Jira API (if want to use JIRA as additional context)


## Setup
1. Clone this repository.
2. Install dependencies by running `npm install gpt-auto-committer -g`.

## Configuration
### Environment Variables
Set the following environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key.
- `OPENAI_MODEL`: Use a different GPT Model when generating commits & pull-requests (default: gpt-3.5-turbo-1106)
- `GITHUB_ACCESS_TOKEN`: Your GitHub personal access token. (required when creating PR)
- `JIRA_EMAIL`: Your Jira account email. (required when supplying issue id)
- `JIRA_API_KEY`: Your Jira API key. (required when supplying issue id)
- `JIRA_DOMAIN`: Your Jira domain. (required when supplying issue id)

### Profile Configuration

Alternatively, you can use profiles which are defined in an INI-style configuration file located at `~/.gac/profile`. The file can include different profiles, each with its own set of configuration.

```ini
~/.gac/profile

[default]
jiraEmail = default-email@example.com
jiraApiKey = default-api-key
jiraDomain = default-domain
githubAccessToken = default-github-token
openaiApiKey = default-openai-api-key
openaiModel = gpt-3.5-turbo-1106

[projectX]
jiraEmail = projectX-email@example.com
jiraApiKey = projectX-api-key
jiraDomain = projectX-domain
githubAccessToken = projectX-github-token
openaiApiKey = projectX-openai-api-key
openaiModel = gpt-3.5-turbo-1106
```
## Usage

### Running the Script
1. Install GPT-Auto-Commiter:
   ```bash
   npm install gpt-auto-committer
   ```
2. Run it
   ```bash
   npx gac <Jira_issue_ID> [--update-pr] [--force] [--version=<version>] [--branch=<branch_name>]
   ```
  - `<Jira_issue_ID>`: Optional Jira issue ID.
  - `--update-pr`: Flag to create or update a pull request.
  - `--force`: Flag to force push changes. 
  - --version=<version>: Optional flag to specify the version bump (e.g., --version=patch/minor/major). 
  - --branch=<branch_name>: Optional flag to specify a new branch name. 
  - If on head branch and a jira issue was supplied and no new branch was supplied, a branch will be created in the same name as the jira issue id.
3. Profit!

## Functionality
- **Pull Request Updates:** Updates or creates a pull request with generated descriptions based on Git Diff and optional Jira content.
- **OpenAI Integration:** Utilizes the GPT-3.5 model for commit messages and pull request descriptions.

## Customization
- Make sure to review and customize Handlebars templates in the `./prompts` directory for commit messages and pull request descriptions.
