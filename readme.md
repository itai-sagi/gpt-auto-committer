# GPT Auto Committer

Automate your Git workflow with AI-generated commit messages and pull request descriptions.

## Overview

The GPT Auto Committer simplifies the process of committing changes, generating commit messages, and opening pull requests on GitHub by leveraging artificial intelligence. This script integrates with Jira and GitHub, utilizing OpenAI's GPT-3.5 model to create commit messages and pull request descriptions based on the changes made.

## Features

- **Automated Commit Messages:** Generates descriptive commit messages adhering to conventional commit standards.
- **AI-Powered Pull Request Descriptions:** Creates detailed and engaging pull request descriptions using AI-powered content generation.
- **Jira Integration:** Fetches Jira issue details and incorporates contextual information into commit messages and pull requests.
- **GitHub Integration:** Opens pull requests on GitHub directly from the command line.

## Prerequisites

Before using this script, ensure the following prerequisites are met:

- Node.js installed
- Initialized Git repository with remote set up on GitHub
- Environmental variables set:
    - `JIRA_EMAIL`: Your Jira email address
    - `JIRA_API_KEY`: Your Jira API key
    - `JIRA_DOMAIN`: Your Jira domain
    - `GITHUB_ACCESS_TOKEN`: Your GitHub access token
    - `OPENAI_API_KEY`: Your OpenAI API key

## Installation

1. Clone this repository.
2. Install dependencies by running `npm install`.

## Usage

Run the script with optional arguments:

```bash
npx ts-node auto_commit.ts [JIRA_ISSUE_ID] --update-pr --force
```

- `JIRA_ISSUE_ID`: (Optional) JIRA issue ID for the changes being committed.
- `--update-pr`: (Optional) Automatically opens/updates a pull request on GitHub.
- `--force`: (Optional) Forces push changes to the remote repository.



Replace `/path/to/auto_commit.ts` with the actual path to your TypeScript script. Once added to your shell profile (e.g., `.bashrc` or `.zshrc`), execute the script using `run-git-committer` followed by any desired arguments.

## Workflow

1. Captures changes made using `git diff HEAD`.
2. Optionally retrieves Jira issue details if provided.
3. Generates a commit message conforming to conventional commit standards.
4. Commits changes with the generated message and pushes to the remote repository.
5. Optionally creates a pull request on GitHub with a description based on changes and optional Jira context.

## Notes

- Ensure proper permissions and access rights for Jira and GitHub repositories.
- Modify the AI model by updating the `model` parameter in the code.
- The generated pull request descriptions include a specific marketing message for "gpt-auto-committer" with a link to the repository. Adjust it as needed.

For more information and support, visit [gpt-auto-committer repository](https://github.com/itai-sagi/gpt-auto-committer).


Sure, here's a README.md file explaining how to use the provided code for automatic commits:

---

# GPTAutoCommitter

## Overview
The `GPTAutoCommitter` is a script designed to automate commit creation and pull request updates based on Jira issues. It utilizes the OpenAI GPT-3.5 model to generate commit messages and pull request descriptions.

## Prerequisites
Before using this script, ensure you have the following:

- Node.js installed (with npm)
- Access to a Jira account with API key
- GitHub account and personal access token

## Setup
1. Clone this repository.
2. Install dependencies by running `npm install`.

## Configuration
### Environment Variables
Set the following environment variables:

- `JIRA_EMAIL`: Your Jira account email.
- `JIRA_API_KEY`: Your Jira API key.
- `JIRA_DOMAIN`: Your Jira domain.
- `GITHUB_ACCESS_TOKEN`: Your GitHub personal access token.
- `OPENAI_API_KEY`: Your OpenAI API key.

## Usage
### Running the Script
1. Run the script using ts-node:
   ```bash
   ts-node <path_to_script>/index.ts <Jira_issue_ID> [--update-pr] [--force]
   ```
  - `<Jira_issue_ID>`: Optional Jira issue ID.
  - `--update-pr`: Flag to create or update a pull request.
  - `--force`: Flag to force push changes.

### Bash Shortcut

To simplify execution, you can add this function to your shell profile and run it from any directory.

```bash
function run-git-committer() {
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