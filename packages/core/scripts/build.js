#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Claude Code Router Core...');

try {
  // Build the core library
  console.log('Building core library...');
  execSync('esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js --minify --external:@musistudio/llms --external:fastify --external:@anthropic-ai/sdk', { stdio: 'inherit' });

  console.log('Core build completed successfully!');
} catch (error) {
  console.error('Core build failed:', error.message);
  process.exit(1);
}
