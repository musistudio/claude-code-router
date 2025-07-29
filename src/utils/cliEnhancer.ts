import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import boxen from 'boxen';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Config, Provider } from '../types';

const CONFIG_DIR = process.env.CCR_CONFIG_DIR || join(homedir(), '.claude-code-router');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const theme = {
  primary: chalk.hex('#00E0FF'),
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  muted: chalk.gray,
  bold: chalk.bold,
  highlight: chalk.bgHex('#00E0FF').black
};

export function showBanner(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
  const colors = {
    success: { borderColor: 'green', titleColor: theme.success },
    error: { borderColor: 'red', titleColor: theme.error },
    info: { borderColor: 'cyan', titleColor: theme.primary },
    warning: { borderColor: 'yellow', titleColor: theme.warning }
  };

  const config = colors[type];
  
  console.log(boxen(config.titleColor(message), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: config.borderColor as any,
    textAlignment: 'center'
  }));
}

export function createSpinner(text: string) {
  return ora({
    text,
    spinner: 'dots',
    color: 'cyan'
  });
}

export function formatProvider(provider: Provider): string {
  const models = provider.models.join(', ');
  const hasTransformer = provider.transformer && provider.transformer.use && provider.transformer.use.length > 0;
  
  return `${theme.bold(provider.name)} ${theme.muted(`(${provider.api_base_url})`)}
  ${theme.info('Models:')} ${models}
  ${theme.info('API Key:')} ${provider.api_key ? theme.success('✓ Configured') : theme.error('✗ Not set')}
  ${hasTransformer ? theme.info('Transformer:') + ' ' + theme.primary(JSON.stringify(provider.transformer.use)) : ''}`;
}

export function showProvidersTable(providers: Provider[]) {
  if (!providers || providers.length === 0) {
    console.log(theme.warning('\n⚠️  No providers configured\n'));
    return;
  }

  const table = new Table({
    head: [
      theme.bold('Provider'),
      theme.bold('API Base URL'),
      theme.bold('Models'),
      theme.bold('API Key'),
      theme.bold('Transformer')
    ],
    style: {
      head: [],
      border: []
    },
    colWidths: [15, 40, 30, 12, 20]
  });

  providers.forEach(provider => {
    const hasTransformer = provider.transformer && provider.transformer.use && provider.transformer.use.length > 0;
    table.push([
      theme.primary(provider.name),
      theme.muted(provider.api_base_url),
      provider.models.join('\n'),
      provider.api_key ? theme.success('✓') : theme.error('✗'),
      hasTransformer ? theme.info(JSON.stringify(provider.transformer.use)) : theme.muted('none')
    ]);
  });

  console.log('\n' + theme.bold.underline('Configured Providers:'));
  console.log(table.toString());
}

export function showRouterConfig(router: any) {
  if (!router) return;

  const table = new Table({
    head: [theme.bold('Route'), theme.bold('Provider'), theme.bold('Model')],
    style: {
      head: [],
      border: []
    }
  });

  Object.entries(router).forEach(([key, value]) => {
    if (typeof value === 'string' && value.includes(',')) {
      const [provider, model] = value.split(',');
      table.push([
        theme.primary(key),
        theme.info(provider),
        theme.muted(model)
      ]);
    } else if (key !== 'longContextThreshold') {
      table.push([
        theme.primary(key),
        theme.muted(String(value)),
        ''
      ]);
    }
  });

  console.log('\n' + theme.bold.underline('Router Configuration:'));
  console.log(table.toString());
  
  if (router.longContextThreshold) {
    console.log(`\n${theme.info('Long Context Threshold:')} ${theme.bold(router.longContextThreshold)} tokens`);
  }
}

export async function addProvider(name: string, apiBaseUrl: string, apiKey: string, models: string[], transformer?: string) {
  const spinner = createSpinner('Adding provider...');
  spinner.start();

  try {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    let config: Config;
    
    if (existsSync(CONFIG_FILE)) {
      const configContent = readFileSync(CONFIG_FILE, 'utf-8');
      config = JSON.parse(configContent);
    } else {
      config = {
        Providers: [],
        Router: {
          default: '',
          background: '',
          think: '',
          longContext: '',
          longContextThreshold: 60000,
          webSearch: ''
        },
        APIKEY: '',
        HOST: '0.0.0.0',
        API_TIMEOUT_MS: 600000
      };
    }

    const existingIndex = config.Providers.findIndex(p => p.name === name);
    const provider: Provider = {
      name,
      api_base_url: apiBaseUrl,
      api_key: apiKey,
      models
    };

    if (transformer) {
      provider.transformer = {
        use: [transformer]
      };
    }

    if (existingIndex >= 0) {
      config.Providers[existingIndex] = provider;
      spinner.succeed(theme.success(`✅ Updated provider: ${theme.bold(name)}`));
    } else {
      config.Providers.push(provider);
      spinner.succeed(theme.success(`✅ Added new provider: ${theme.bold(name)}`));
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    console.log('\n' + theme.info('Provider configuration:'));
    console.log(formatProvider(provider));
    
  } catch (error: any) {
    spinner.fail(theme.error(`Failed to add provider: ${error.message}`));
    throw error;
  }
}

export async function listProviders() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      showBanner('No configuration file found. Run "ccr start" to create one.', 'warning');
      return;
    }

    const configContent = readFileSync(CONFIG_FILE, 'utf-8');
    const config: Config = JSON.parse(configContent);

    showBanner('Claude Code Router Configuration', 'info');
    showProvidersTable(config.Providers);
    showRouterConfig(config.Router);
    
    if (config.APIKEY) {
      console.log(`\n${theme.info('API Key:')} ${theme.success('✓ Configured')}`);
    }
    
    console.log(`\n${theme.info('Host:')} ${theme.bold(config.HOST || '0.0.0.0')}`);
    console.log(`${theme.info('API Timeout:')} ${theme.bold((config.API_TIMEOUT_MS || 600000) / 1000)}s\n`);
    
  } catch (error: any) {
    showBanner(`Failed to read configuration: ${error.message}`, 'error');
    throw error;
  }
}

export function showSuccess(message: string) {
  console.log(theme.success(`\n✅ ${message}\n`));
}

export function showError(message: string) {
  console.log(theme.error(`\n❌ ${message}\n`));
}

export function showInfo(message: string) {
  console.log(theme.info(`\nℹ️  ${message}\n`));
}

export function showWarning(message: string) {
  console.log(theme.warning(`\n⚠️  ${message}\n`));
}