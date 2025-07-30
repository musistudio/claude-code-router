#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Claude Code Router...');

try {
  // Build the main CLI application
  console.log('Building CLI application...');
  execSync('esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js', { stdio: 'inherit' });
  
  // Copy the tiktoken WASM file
  console.log('Copying tiktoken WASM file...');
  execSync('shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm', { stdio: 'inherit' });
  
  // Build the UI
  console.log('Building UI...');
  // Check if node_modules exists in ui directory, if not install dependencies
  if (!fs.existsSync('ui/node_modules')) {
    console.log('Installing UI dependencies...');
    execSync('cd ui && npm install', { stdio: 'inherit' });
  }
  execSync('cd ui && npm run build', { stdio: 'inherit' });
  
  // Copy the built UI index.html to dist
  console.log('Copying UI build artifacts...');
  execSync('shx cp ui/dist/index.html dist/index.html', { stdio: 'inherit' });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}