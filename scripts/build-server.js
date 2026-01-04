#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Server package...');

try {
  const serverDir = path.join(__dirname, '../packages/server');

  // Create dist directory
  const distDir = path.join(serverDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Generate type declaration files
  console.log('Generating type declaration files...');
  execSync('tsc --emitDeclarationOnly', {
    stdio: 'inherit',
    cwd: serverDir
  });

  // Build the server application
  console.log('Building server application...');
  // 使用 minify 和 tree-shaking 优化体积
  execSync('esbuild src/index.ts --bundle --platform=node --minify --tree-shaking=true --outfile=dist/index.js', {
    stdio: 'inherit',
    cwd: serverDir
  });

  // Copy the tiktoken WASM file
  console.log('Copying tiktoken WASM file...');
  const tiktokenSource = path.join(__dirname, '../packages/server/node_modules/tiktoken/tiktoken_bg.wasm');
  const tiktokenDest = path.join(__dirname, '../packages/server/dist/tiktoken_bg.wasm');

  if (fs.existsSync(tiktokenSource)) {
    fs.copyFileSync(tiktokenSource, tiktokenDest);
    console.log('Tiktoken WASM file copied successfully!');
  } else {
    console.warn('Warning: tiktoken_bg.wasm not found, skipping...');
  }

  console.log('Server build completed successfully!');
} catch (error) {
  console.error('Server build failed:', error.message);
  process.exit(1);
}
