#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Building Claude Code Router (Monorepo)...');

try {
  // Build core package first (@musistudio/llms)
  console.log('Building core package (@musistudio/llms)...');
  execSync('node scripts/build-core.js', { stdio: 'inherit' });

  // Build shared package
  console.log('Building shared package...');
  execSync('node scripts/build-shared.js', { stdio: 'inherit' });

  // Build CLI package (which will also build server and ui)
  console.log('Building CLI package (includes server and ui)...');
  execSync('node scripts/build-cli.js', { stdio: 'inherit' });

  console.log('\n✅ Build completed successfully!');
  console.log('\nArtifacts are available in packages/*/dist:');
  console.log('  - packages/core/dist/     (Core package: @musistudio/llms)');
  console.log('  - packages/shared/dist/   (Shared package)');
  console.log('  - packages/cli/dist/      (CLI + UI + tiktoken)');
  console.log('  - packages/server/dist/   (Server standalone)');
  console.log('  - packages/ui/dist/       (UI standalone)');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}