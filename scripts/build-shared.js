#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Shared package...');

try {
  const sharedDir = path.join(__dirname, '../packages/shared');

  // Create dist directory
  const distDir = path.join(sharedDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Generate type declaration files
  console.log('Generating type declaration files...');
  execSync('tsc --emitDeclarationOnly', {
    stdio: 'inherit',
    cwd: sharedDir
  });

  // Build the shared package
  console.log('Building shared package...');
  execSync('esbuild src/index.ts --bundle --platform=node --minify --tree-shaking=true --outfile=dist/index.js', {
    stdio: 'inherit',
    cwd: sharedDir
  });

  console.log('Shared package build completed successfully!');
} catch (error) {
  console.error('Shared package build failed:', error.message);
  process.exit(1);
}
