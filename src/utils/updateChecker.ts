import { execSync } from 'child_process';
import { theme, showWarning, showInfo } from './cliEnhancer';
import { version } from '../../package.json';
import https from 'https';
import { logger } from './logger';

interface NpmPackageInfo {
  'dist-tags': {
    latest: string;
  };
  versions: Record<string, any>;
}

async function getLatestVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'registry.npmjs.org',
      path: `/${packageName}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const packageInfo: NpmPackageInfo = JSON.parse(data);
          resolve(packageInfo['dist-tags'].latest);
        } catch (error) {
          logger.debug('Failed to parse npm registry response', { error });
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      logger.debug('Failed to check npm registry', { error });
      resolve(null);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (currentParts[i] < latestParts[i]) return -1;
    if (currentParts[i] > latestParts[i]) return 1;
  }
  
  return 0;
}

let hasCheckedUpdate = false;

export async function checkForUpdates(skipCommands: string[] = ['version', '-v', 'help', '-h']) {
  // Only check once per session
  if (hasCheckedUpdate) return;
  hasCheckedUpdate = true;

  // Skip update check for certain commands
  const command = process.argv[2];
  if (skipCommands.includes(command)) return;

  // Skip in test environment
  if (process.env.NODE_ENV === 'test') return;

  // Skip if explicitly disabled
  if (process.env.CCR_SKIP_UPDATE_CHECK === 'true') return;

  try {
    const packageName = 'ccr-next';
    const currentVersion = version;
    const latestVersion = await getLatestVersion(packageName);

    if (!latestVersion) {
      // Silently fail if we can't check
      return;
    }

    const comparison = compareVersions(currentVersion, latestVersion);
    
    if (comparison < 0) {
      console.log(''); // Empty line for spacing
      showWarning(`A new version of ${packageName} is available!`);
      console.log(theme.muted(`  Current version: ${currentVersion}`));
      console.log(theme.success(`  Latest version:  ${latestVersion}`));
      console.log('');
      console.log(theme.info('  Update with:'));
      console.log(theme.primary(`    npm install -g ${packageName}@latest`));
      console.log('');
      console.log(theme.muted('  To skip this check, set CCR_SKIP_UPDATE_CHECK=true'));
      console.log(''); // Empty line for spacing
    }
  } catch (error) {
    // Silently fail - don't interrupt the user's workflow
    logger.debug('Update check failed', { error });
  }
}

export function getUpdateCommand(): string {
  // Check if installed globally
  try {
    execSync('npm list -g ccr-next', { stdio: 'ignore' });
    return 'npm install -g ccr-next@latest';
  } catch {
    // Not installed globally, assume local
    return 'npm install ccr-next@latest';
  }
}