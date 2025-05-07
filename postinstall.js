#!/usr/bin/env node

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const gacDir      = path.join(os.homedir(), '.gac');
const profilePath = path.join(gacDir, 'profile');
const userPrompts = path.join(gacDir, 'prompts');
const pkgPrompts  = path.resolve(__dirname, '..', 'prompts');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

function writeDefaultProfile() {
  if (fs.existsSync(profilePath)) {
    console.log(`Profile already exists at ${profilePath}`);
    return;
  }

  const content = `
[default]
jiraEmail         = ${process.env.JIRA_EMAIL || ''}
jiraApiKey        = ${process.env.JIRA_API_KEY || ''}
jiraDomain        = ${process.env.JIRA_DOMAIN || ''}
githubAccessToken = ${process.env.GITHUB_ACCESS_TOKEN || ''}
openaiApiKey      = ${process.env.OPENAI_API_KEY || ''}
openaiModel       = ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo-1106'}
  `.trim() + '\n';

  fs.writeFileSync(profilePath, content);
  console.log(`Created default profile at ${profilePath}`);
}

function copyPromptFiles() {
  ensureDirectory(userPrompts);

  let files;
  try {
    files = fs.readdirSync(pkgPrompts);
  } catch (err) {
    console.error(`Cannot read packaged prompts at ${pkgPrompts}: ${err.message}`);
    return;
  }

  files.forEach(file => {
    const src  = path.join(pkgPrompts, file);
    const dest = path.join(userPrompts, file);

    if (fs.existsSync(dest)) {
      console.log(`Skipped existing prompt: ${file}`);
    } else {
      fs.copyFileSync(src, dest);
      console.log(`Copied prompt: ${file}`);
    }
  });
}

function linkPromptsDir() {
  try {
    const stat = fs.lstatSync(pkgPrompts);
    if (stat.isSymbolicLink()) {
      console.log(`Prompts directory already a symlink`);
      return;
    }
  } catch {
    // not existing or not a symlink — proceed to replace
  }

  fs.rmSync(pkgPrompts, { recursive: true, force: true });
  fs.symlinkSync(userPrompts, pkgPrompts, 'junction');
  console.log(`Symlinked ${pkgPrompts} → ${userPrompts}`);
}

function main() {
  ensureDirectory(gacDir);
  writeDefaultProfile();
  copyPromptFiles();
  linkPromptsDir();
}

main();
