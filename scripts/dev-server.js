#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');

const serverDir = path.join(__dirname, '../packages/server');
const buildScript = path.join(__dirname, 'build-server.js');

try {
  execSync('node ' + JSON.stringify(buildScript), { stdio: 'inherit' });
} catch {
  process.exit(1);
}

console.log('Starting server...');
console.log('  cwd:', serverDir);

const child = spawn('node', ['dist/index.js'], {
  cwd: serverDir,
  stdio: ['inherit', 'inherit', 'inherit'],
  env: { ...process.env }
});

child.on('spawn', () => {
  console.log('Server process spawned, PID:', child.pid);
});

child.on('exit', (code, signal) => {
  console.log('Server process exited with code:', code, 'signal:', signal);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  child.kill('SIGINT');
});
process.on('SIGTERM', () => child.kill('SIGTERM'));
