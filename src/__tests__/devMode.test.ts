import fs from 'fs';
import path from 'path';

describe('Dev Mode', () => {
  it('should have the correct dev script in package.json', () => {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    expect(packageJson.scripts.dev).toBe(
      "nodemon --watch 'src/**' --ext ts --exec 'npm run build && node dist/cli.js'"
    );
  });

  it('should have test script in package.json', () => {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    expect(packageJson.scripts.test).toBe("jest");
  });
});