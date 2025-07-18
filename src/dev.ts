import { spawn } from 'child_process';
import path from 'path';

export function startDevMode() {
  const nodemon = spawn('nodemon', [
    '--watch', 
    'src/**', 
    '--ext', 
    'ts', 
    '--exec', 
    'npm run build && node dist/cli.js'
  ], { stdio: 'inherit' });

  nodemon.on('error', (err) => {
    console.error('Failed to start nodemon:', err);
  });

  return nodemon;
}

if (require.main === module) {
  startDevMode();
}