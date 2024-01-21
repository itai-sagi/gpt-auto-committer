const fs = require('fs');
const os = require('os');
const path = require('path');

const gacDirectory = path.join(os.homedir(), '.gac');
const defaultProfilePath = path.join(gacDirectory, 'profile');

if (!fs.existsSync(gacDirectory)) {
    fs.mkdirSync(gacDirectory);
    console.log(`Creating directory: ${gacDirectory}`);
}

if (!fs.existsSync(defaultProfilePath)) {
    const defaultProfileContent = `
    [default]
    jiraEmail = ${process.env.JIRA_EMAIL || ''}
    jiraApiKey = ${process.env.JIRA_API_KEY || ''}
    jiraDomain = ${process.env.JIRA_DOMAIN || ''}
    githubAccessToken = ${process.env.GITHUB_ACCESS_TOKEN || ''}
    openaiApiKey = ${process.env.OPENAI_API_KEY || ''}
    openaiModel = ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo-1106'}
    `;

    fs.writeFileSync(defaultProfilePath, defaultProfileContent.trim());
    console.log(`Default profile created at: ${defaultProfilePath}`);
} else {
    console.log(`Default profile already exists at: ${defaultProfilePath}`);
}
