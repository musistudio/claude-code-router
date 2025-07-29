const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Build the CLI with esbuild
console.log('Building CLI...');
const buildCmd = 'esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js';
execSync(buildCmd, { stdio: 'inherit' });

// Add shebang after build
const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
const content = fs.readFileSync(cliPath, 'utf8');
const withShebang = '#!/usr/bin/env node\n' + content;
fs.writeFileSync(cliPath, withShebang, 'utf8');

// Copy wasm file
console.log('Copying tiktoken wasm file...');
const wasmSrc = path.join(__dirname, '..', 'node_modules', 'tiktoken', 'tiktoken_bg.wasm');
const wasmDest = path.join(__dirname, '..', 'dist', 'tiktoken_bg.wasm');
if (fs.existsSync(wasmSrc)) {
  fs.copyFileSync(wasmSrc, wasmDest);
}

// Make executable on Unix-like systems
if (process.platform !== 'win32') {
  try {
    execSync(`chmod +x ${cliPath}`, { stdio: 'inherit' });
  } catch (e) {
    // Ignore chmod errors on Windows
  }
}

console.log('Build complete!');