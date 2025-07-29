import { run } from './index';
import { showStatus } from './utils/status';
import { executeCodeCommand } from './utils/codeCommand';
import { cleanupPidFile, isServiceRunning } from './utils/processCheck';
import { version } from '../package.json';
import { spawn } from 'child_process';
import { PID_FILE, REFERENCE_COUNT_FILE } from './constants';
import fs, { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './utils/logger';
import { formatErrorMessage } from './utils/errorHandler';
import { handleStopCommand, stopService } from './utils/serviceControl';
import {
  showBanner,
  createSpinner,
  addProvider,
  listProviders,
  showSuccess,
  showError,
  showInfo,
  showWarning,
  theme,
} from './utils/cliEnhancer';
import { checkForUpdates } from './utils/updateChecker';

const command = process.argv[2];

const HELP_TEXT = `
${theme.bold('Usage:')} ccr [command] [options]

${theme.bold('Commands:')}
  ${theme.primary('start')}         Start server 
                Options:
                  --provider <name> <url> <key> <models>  Add/update provider
                  --transformer <provider> <transformer>   Set transformer for provider
  ${theme.primary('stop')}          Stop server
  ${theme.primary('restart')}       Restart server (supports same options as start)
  ${theme.primary('status')}        Show server status
  ${theme.primary('code')}          Execute claude command
  ${theme.primary('provider')}      Manage providers
                  add <name> <url> <key> <models>         Add/update provider
                  list                                     List all providers
  ${theme.primary('-v, version')}   Show version information
  ${theme.primary('-h, help')}      Show help information

${theme.bold('Examples:')}
  ${theme.muted('ccr start')}
  ${theme.muted('ccr start --provider openrouter https://openrouter.ai/api/v1/chat/completions sk-xxx claude-3.5-sonnet,gemini-2.0-flash')}
  ${theme.muted('ccr start --transformer openrouter openrouter')}
  ${theme.muted('ccr provider add deepseek https://api.deepseek.com/chat/completions sk-xxx deepseek-chat')}
  ${theme.muted('ccr provider list')}
  ${theme.muted('ccr code "Write a Hello World"')}
`;

async function waitForService(timeout = 10000, initialDelay = 1000): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning()) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

function parseStartOptions(args: string[]) {
  const options: any = {
    providers: [],
    transformers: {},
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && i + 4 < args.length) {
      const provider = {
        name: args[i + 1],
        api_base_url: args[i + 2],
        api_key: args[i + 3],
        models: args[i + 4].split(','),
      };
      options.providers.push(provider);
      i += 4;
    } else if (args[i] === '--transformer' && i + 2 < args.length) {
      const providerName = args[i + 1];
      const transformerName = args[i + 2];
      options.transformers[providerName] = {
        use: [transformerName],
      };
      i += 2;
    }
  }

  return options;
}

async function main() {
  // Check for updates (non-blocking)
  checkForUpdates().catch(() => {});

  switch (command) {
    case 'start':
      try {
        const startOptions = parseStartOptions(process.argv.slice(3));
        showBanner('Starting Claude Code Router...', 'info');
        await run(startOptions);
      } catch (error: any) {
        showError(`Failed to start service: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
      break;
    case 'stop':
      await handleStopCommand();
      break;
    case 'status':
      await showStatus();
      break;
    case 'code':
      if (!isServiceRunning()) {
        showInfo('Service not running, starting service...');
        const cliPath = join(__dirname, 'cli.js');
        const startProcess = spawn('node', [cliPath, 'start'], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, LOG_LEVEL: 'error' }, // Reduce noise during auto-start
        });

        startProcess.on('error', error => {
          showError(`Failed to start service: ${formatErrorMessage(error)}`);
          process.exit(1);
        });

        startProcess.unref();

        const spinner = createSpinner('Waiting for service to be ready...');
        spinner.start();
        if (await waitForService()) {
          spinner.succeed(theme.success('Service is ready!'));
          await executeCodeCommand(process.argv.slice(3));
        } else {
          spinner.fail(theme.error('Service startup timeout'));
          showError("Please try running 'ccr start' manually first.");
          process.exit(1);
        }
      } else {
        await executeCodeCommand(process.argv.slice(3));
      }
      break;
    case '-v':
    case 'version':
      showBanner(`Claude Code Router v${version}`, 'info');
      break;
    case 'restart':
      // Stop the service if it's running
      showInfo('Restarting Claude Code Router service...');
      const stopSpinner = createSpinner('Stopping service...');
      stopSpinner.start();

      if (existsSync(PID_FILE)) {
        const stopped = await stopService({ force: true, timeout: 5000 });
        if (stopped) {
          stopSpinner.succeed(theme.success('Service stopped'));
        } else {
          stopSpinner.info(theme.info('Service may have already been stopped'));
          logger.debug('Service may have already been stopped');
        }
      } else {
        stopSpinner.info(theme.info('No running service found'));
      }

      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the service again in the background with options
      const startSpinner = createSpinner('Starting service...');
      startSpinner.start();

      const cliPath = join(__dirname, 'cli.js');
      const restartArgs = ['start', ...process.argv.slice(3)];
      const startProcess = spawn('node', [cliPath, ...restartArgs], {
        detached: true,
        stdio: 'ignore',
      });

      startProcess.on('error', error => {
        startSpinner.fail(theme.error(`Failed to start service: ${formatErrorMessage(error)}`));
        process.exit(1);
      });

      startProcess.unref();

      // Wait for service to be ready
      if (await waitForService()) {
        startSpinner.succeed(theme.success('Service restarted successfully!'));
        showSuccess('Claude Code Router is ready!');
      } else {
        startSpinner.fail(theme.error('Service failed to start properly'));
        process.exit(1);
      }
      break;
    case 'provider':
      const subCommand = process.argv[3];
      switch (subCommand) {
        case 'add':
          if (process.argv.length < 8) {
            showError('Invalid usage. Expected: ccr provider add <name> <url> <key> <models>');
            console.log(
              theme.muted(
                'Example: ccr provider add deepseek https://api.deepseek.com/chat/completions sk-xxx deepseek-chat,deepseek-reasoner'
              )
            );
            process.exit(1);
          }
          const [, , , , name, url, key, modelsStr, ...rest] = process.argv;
          const models = modelsStr.split(',');
          let transformer: string | undefined;

          // Check if transformer is specified
          if (rest[0] === '--transformer' && rest[1]) {
            transformer = rest[1];
          }

          try {
            await addProvider(name, url, key, models, transformer);
            showInfo('Provider added successfully. Restart the service to apply changes.');
          } catch (error: any) {
            showError(`Failed to add provider: ${error.message}`);
            process.exit(1);
          }
          break;
        case 'list':
          await listProviders();
          break;
        default:
          showError(`Unknown provider subcommand: ${subCommand}`);
          console.log(theme.muted('\nAvailable subcommands: add, list'));
          process.exit(1);
      }
      break;
    case '-h':
    case 'help':
      console.log(HELP_TEXT);
      break;
    default:
      showWarning(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(error => {
  showError(`Fatal error: ${formatErrorMessage(error)}`);
  logger.error('CLI fatal error', { error });
  process.exit(1);
});
