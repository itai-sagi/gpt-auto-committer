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
2. Install dependencies by running `npm install`.

## Configuration
### Environment Variables
Set the following environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key.
- `OPENAI_MODEL`: Use a different GPT Model when generating commits & pull-requests (default: gpt-3.5-turbo-1106)
- `GITHUB_ACCESS_TOKEN`: Your GitHub personal access token. (required when creating PR)
- `JIRA_EMAIL`: Your Jira account email. (required when supplying issue id)
- `JIRA_API_KEY`: Your Jira API key. (required when supplying issue id)
- `JIRA_DOMAIN`: Your Jira domain. (required when supplying issue id)

## Usage
### Running the Script
1. Run the script using ts-node:
   ```bash
   ts-node <path_to_script>/index.ts <Jira_issue_ID> [--update-pr] [--force] [--version=<version>] [--branch=<branch_name>]
   ```
  - `<Jira_issue_ID>`: Optional Jira issue ID.
  - `--update-pr`: Flag to create or update a pull request.
  - `--force`: Flag to force push changes. 
  - `--version=<version>`: Optional flag to specify the version bump (e.g., `--version=patch/minor/major`). if no version is supplied, it will default to `patch`
  - `--branch=<branch_name>`: Optional flag to specify a new branch name. 
  - If on head branch and a jira issue was supplied and no new branch was supplied, a branch will be created as the name of the JIRA Issue.

### Bash Shortcut

To simplify execution, you can add this function to your shell profile and run it from any directory.

```bash
function gac() {
  (
  export GITHUB_ACCESS_TOKEN=xxx && npx ts-node /path/to/auto_commit.ts "$@"
  )
}
```

## Functionality
- **Pull Request Updates:** Updates or creates a pull request with generated descriptions based on Git Diff and optional Jira content.
- **OpenAI Integration:** Utilizes the GPT-3.5 model for commit messages and pull request descriptions.

## Customization
- Make sure to review and customize Handlebars templates in the `./prompts` directory for commit messages and pull request descriptions.
