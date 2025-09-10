const { execSync } = require('child_process');

try {
  console.log('Running Playwright tests...');
  execSync('npx playwright test', { stdio: 'inherit' });
} catch (error) {
  console.error('Playwright tests failed:', error);
  process.exit(1);
}
