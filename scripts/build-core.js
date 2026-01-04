#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Core package (@musistudio/llms)...');

try {
  const coreDir = path.join(__dirname, '../packages/core');

  // Build using the core package's build script
  console.log('Building core package (CJS and ESM)...');
  execSync('pnpm build', {
    stdio: 'inherit',
    cwd: coreDir
  });

  console.log('Core package build completed successfully!');
} catch (error) {
  console.error('Core package build failed:', error.message);
  process.exit(1);
}
