#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectName = process.argv[2];

if (!projectName) {
    console.error('Usage: node scripts/adaptDocker.js <project-name>');
    console.error('Example: node scripts/adaptDocker.js my-app');
    process.exit(1);
}

const dockerComposeFile = path.join(__dirname, '..', 'docker-compose.api.yml');

try {
    let content = fs.readFileSync(dockerComposeFile, 'utf8');

    const oldName = 'base-express-api';
    const newName = `${projectName}-api`;

    content = content.replace(new RegExp(oldName, 'g'), newName);

    fs.writeFileSync(dockerComposeFile, content, 'utf8');

    console.log(`✓ Replaced "${oldName}" with "${newName}" in docker-compose.api.yml`);
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
