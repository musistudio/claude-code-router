import * as fs from 'fs';
import * as path from 'path';
import { select, input, confirm } from '@inquirer/prompts';

// ANSI color codes
const RESET = "\x1B[0m";
const DIM = "\x1B[2m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const CYAN = "\x1B[36m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";

interface TransformerConfig {
  use: Array<string | [string, any]>;
  [key: string]: any;
}

interface Provider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: TransformerConfig;
}

interface RouterConfig {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  [key: string]: string | number | undefined;
}

interface Config {
  Providers: Provider[];
  Router: RouterConfig;
  [key: string]: any;
}

interface ModelResult {
  providerName: string;
  modelName: string;
  modelType: string;
}

const AVAILABLE_TRANSFORMERS = [
  'anthropic',
  'deepseek',
  'gemini',
  'openrouter',
  'groq',
  'maxtoken',
  'tooluse',
  'gemini-cli',
  'reasoning',
  'sampling',
  'enhancetool',
  'cleancache',
  'vertex-gemini',
  'chutes-glm',
  'qwen-cli',
  'rovo-cli'
];

function getConfigPath(): string {
  const configDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude-code-router');
  const configPath = path.join(configDir, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found at ${configPath}`);
  }
  
  return configPath;
}

function loadConfig(): Config {
  const configPath = getConfigPath();
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`${GREEN}✓ config.json updated successfully${RESET}\n`);
}

function getAllModels(config: Config) {
  const models: any[] = [];
  for (const provider of config.Providers) {
    for (const model of provider.models) {
      models.push({
        name: `${BOLDCYAN}${provider.name}${RESET} → ${CYAN} ${model}`,
        value: `${provider.name},${model}`,
        description: `\n${BOLDCYAN}Provider:${RESET} ${provider.name}`,
        provider: provider.name,
        model: model
      });
    }
  }
  return models;
}

function displayCurrentConfig(config: Config): void {
  console.log(`\n${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLDCYAN}           Current Configuration${RESET}`);
  console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);
  
  const formatModel = (routerValue?: string | number) => {
    if (!routerValue || typeof routerValue === 'number') {
      return `${DIM}Not configured${RESET}`;
    }
    const [provider, model] = routerValue.split(',');
    return `${YELLOW}${provider}${RESET} | ${model}\n  ${DIM}- ${routerValue}${RESET}`;
  };
  
  console.log(`${BOLDCYAN}Default Model:${RESET}`);
  console.log(`  ${formatModel(config.Router.default)}\n`);
  
  if (config.Router.background) {
    console.log(`${BOLDCYAN}Background Model:${RESET}`);
    console.log(`  ${formatModel(config.Router.background)}\n`);
  }
  
  if (config.Router.think) {
    console.log(`${BOLDCYAN}Think Model:${RESET}`);
    console.log(`  ${formatModel(config.Router.think)}\n`);
  }
  
  if (config.Router.longContext) {
    console.log(`${BOLDCYAN}Long Context Model:${RESET}`);
    console.log(`  ${formatModel(config.Router.longContext)}\n`);
  }
  
  if (config.Router.webSearch) {
    console.log(`${BOLDCYAN}Web Search Model:${RESET}`);
    console.log(`  ${formatModel(config.Router.webSearch)}\n`);
  }
  
  if (config.Router.image) {
    console.log(`${BOLDCYAN}Image Model:${RESET}`);
    console.log(`  ${formatModel(config.Router.image)}\n`);
  }
  
  console.log(`\n${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLDCYAN}           Add/Update Model${RESET}`);
  console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);
}

async function selectModelType() {
  return await select({
    message: `${BOLDYELLOW}Which model configuration do you want to update?${RESET}`,
    choices: [
      { name: 'Default Model', value: 'default' },
      { name: 'Background Model', value: 'background' },
      { name: 'Think Model', value: 'think' },
      { name: 'Long Context Model', value: 'longContext' },
      { name: 'Web Search Model', value: 'webSearch' },
      { name: 'Image Model', value: 'image' },
      { name: `${BOLDGREEN}+ Add New Model${RESET}`, value: 'addModel' }
    ]
  });
}

async function selectModel(config: Config, modelType: string) {
  const models = getAllModels(config);
  
  return await select({
    message: `\n${BOLDYELLOW}Select a model for ${modelType}:${RESET}`,
    choices: models,
    pageSize: 15
  });
}

async function configureTransformers(): Promise<TransformerConfig | undefined> {
  const useTransformers = await confirm({
    message: `\n${BOLDYELLOW}Add transformer configuration?${RESET}`,
    default: false
  });
  
  if (!useTransformers) {
    return undefined;
  }
  
  const transformers: Array<string | [string, any]> = [];
  let addMore = true;
  
  while (addMore) {
    const transformer = await select({
      message: `\n${BOLDYELLOW}Select a transformer:${RESET}`,
      choices: AVAILABLE_TRANSFORMERS.map(t => ({ name: t, value: t })),
      pageSize: 15
    }) as string;
    
    // Check if transformer needs options
    if (transformer === 'maxtoken') {
      const maxTokens = await input({
        message: `\n${BOLDYELLOW}Max tokens:${RESET}`,
        default: '30000',
        validate: (value: string) => {
          const num = parseInt(value);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a valid positive number';
          }
          return true;
        }
      });
      transformers.push(['maxtoken', { max_tokens: parseInt(maxTokens) }]);
    } else if (transformer === 'openrouter') {
      const addProvider = await confirm({
        message: `\n${BOLDYELLOW}Add provider routing options?${RESET}`,
        default: false
      });
      
      if (addProvider) {
        const providerInput = await input({
          message: 'Provider (e.g., moonshotai/fp8):',
          validate: (value: string) => value.trim() !== '' || 'Provider cannot be empty'
        });
        transformers.push(['openrouter', { provider: { only: [providerInput] } }]);
      } else {
        transformers.push(transformer);
      }
    } else {
      transformers.push(transformer);
    }
    
    addMore = await confirm({
      message: `\n${BOLDYELLOW}Add another transformer?${RESET}`,
      default: false
    });
  }
  
  return { use: transformers };
}

async function addNewModel(config: Config): Promise<ModelResult | null> {
  const providerChoices = config.Providers.map(p => ({
    name: p.name,
    value: p.name
  }));
  
  providerChoices.push({ name: `${BOLDGREEN}+ Add New Provider${RESET}`, value: '__new__' });
  
  const selectedProvider = await select({
    message: `\n${BOLDYELLOW}Select provider for the new model:${RESET}`,
    choices: providerChoices
  }) as string;
  
  if (selectedProvider === '__new__') {
    return await addNewProvider(config);
  } else {
    return await addModelToExistingProvider(config, selectedProvider);
  }
}

async function addModelToExistingProvider(config: Config, providerName: string): Promise<ModelResult | null> {
  const modelName = await input({
    message: `\n${BOLDYELLOW}Enter the model name:${RESET}`,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Model name cannot be empty';
      }
      return true;
    }
  });
  
  const provider = config.Providers.find(p => p.name === providerName);
  
  if (!provider) {
    console.log(`${YELLOW}Provider not found${RESET}`);
    return null;
  }
  
  if (provider.models.includes(modelName)) {
    console.log(`${YELLOW}Model already exists in provider${RESET}`);
    return null;
  }
  
  provider.models.push(modelName);
  
  // Ask about model-specific transformers
  const addModelTransformer = await confirm({
    message: `\n${BOLDYELLOW}Add model-specific transformer configuration?${RESET}`,
    default: false
  });
  
  if (addModelTransformer) {
    const transformerConfig = await configureTransformers();
    if (transformerConfig && provider.transformer) {
      provider.transformer[modelName] = transformerConfig;
    }
  }
  
  saveConfig(config);
  
  console.log(`${GREEN}✓ Model "${modelName}" added to provider "${providerName}"${RESET}`);
  
  const setAsDefault = await confirm({
    message: `\n${BOLDYELLOW}Do you want to set this model in router configuration?${RESET}`,
    default: false
  });
  
  if (setAsDefault) {
    const modelType = await select({
      message: `\n${BOLDYELLOW}Select configuration type:${RESET}`,
      choices: [
        { name: 'Default Model', value: 'default' },
        { name: 'Background Model', value: 'background' },
        { name: 'Think Model', value: 'think' },
        { name: 'Long Context Model', value: 'longContext' },
        { name: 'Web Search Model', value: 'webSearch' },
        { name: 'Image Model', value: 'image' }
      ]
    }) as string;
    
    return { providerName, modelName, modelType };
  }
  
  return null;
}

async function addNewProvider(config: Config): Promise<ModelResult | null> {
  console.log(`\n${BOLDCYAN}Adding New Provider${RESET}\n`);
  
  const providerName = await input({
    message: `${BOLDYELLOW}Provider name:${RESET}`,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Provider name cannot be empty';
      }
      if (config.Providers.some(p => p.name === value)) {
        return 'Provider already exists';
      }
      return true;
    }
  });
  
  const apiBaseUrl = await input({
    message: `\n${BOLDYELLOW}API base URL:${RESET}`,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'API base URL cannot be empty';
      }
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    }
  });
  
  const apiKey = await input({
    message: `\n${BOLDYELLOW}API key:${RESET}`,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'API key cannot be empty';
      }
      return true;
    }
  });
  
  const modelsInput = await input({
    message: `\n${BOLDYELLOW}Model names (comma-separated):${RESET}`,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'At least one model name is required';
      }
      return true;
    }
  });
  
  const models = modelsInput.split(',').map(m => m.trim()).filter(m => m);
  
  const newProvider: Provider = {
    name: providerName,
    api_base_url: apiBaseUrl,
    api_key: apiKey,
    models: models
  };
  
  // Global transformer configuration
  const transformerConfig = await configureTransformers();
  if (transformerConfig) {
    newProvider.transformer = transformerConfig;
  }
  
  config.Providers.push(newProvider);
  saveConfig(config);
  
  console.log(`${GREEN}\n✓ Provider "${providerName}" added successfully${RESET}`);
  
  const setAsDefault = await confirm({
    message: `\n${BOLDYELLOW}Do you want to set one of these models in router configuration?${RESET}`,
    default: false
  });
  
  if (setAsDefault && models.length > 0) {
    let selectedModel = models[0];
    
    if (models.length > 1) {
      selectedModel = await select({
        message: `\n${BOLDYELLOW}Select which model to configure:${RESET}`,
        choices: models.map(m => ({ name: m, value: m }))
      }) as string;
    }
    
    const modelType = await select({
      message: `\n${BOLDYELLOW}Select configuration type:${RESET}`,
      choices: [
        { name: 'Default Model', value: 'default' },
        { name: 'Background Model', value: 'background' },
        { name: 'Think Model', value: 'think' },
        { name: 'Long Context Model', value: 'longContext' },
        { name: 'Web Search Model', value: 'webSearch' },
        { name: 'Image Model', value: 'image' }
      ]
    }) as string;
    
    return { providerName, modelName: selectedModel, modelType };
  }
  
  return null;
}

export async function runModelSelector(): Promise<void> {
  console.clear();
  
  try {
    let config = loadConfig();
    displayCurrentConfig(config);
    
    const action = await selectModelType() as string;
    
    if (action === 'addModel') {
      const result = await addNewModel(config);
      
      if (result) {
        config = loadConfig();
        config.Router[result.modelType] = `${result.providerName},${result.modelName}`;
        saveConfig(config);
        console.log(`${GREEN}✓ ${result.modelType} set to ${result.providerName},${result.modelName}${RESET}`);
      }
    } else {
      const selectedModel = await selectModel(config, action) as string;
      config.Router[action] = selectedModel;
      saveConfig(config);
      
      console.log(`${GREEN}✓ ${action} model updated to: ${selectedModel}${RESET}`);
    }
    
    displayCurrentConfig(config);
  } catch (error: any) {
    console.error(`${YELLOW}Error:${RESET}`, error.message);
    process.exit(1);
  }
}