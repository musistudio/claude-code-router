import * as fs from 'fs';
import * as path from 'path';
import { confirm, input, select } from '@inquirer/prompts';
import {
  RouteGroup,
  RouteGroupsConfig,
  ValidationResult,
  ExtendedConfig,
  RouteGroupOptions,
  SwitchGroupOptions
} from '../types/routeGroup';
import { Provider } from './modelSelector';
import { readConfigFile, writeConfigFile, backupConfigFile } from './index';

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const RED = "\x1B[31m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";
const BOLDRED = "\x1B[1m\x1B[31m";

/**
 * Route Group Manager
 * Provides create, delete, update, switch and validation functions for route groups
 */
export class RouteGroupManager {
  /**
   * Create a route group
   */
  static async createGroup(name: string, config: RouteGroup, options: RouteGroupOptions = {}): Promise<void> {
    if (!name || name.trim() === '') {
      throw new Error('Route group name cannot be empty');
    }

    if (!config.default) {
      throw new Error('Route group must include default configuration');
    }

    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Initialize RouteGroups configuration
    if (!fullConfig.RouteGroups) {
      fullConfig.RouteGroups = {
        activeGroup: name,
        groups: {}
      };
    }

    // Check if route group already exists
    if (fullConfig.RouteGroups.groups[name]) {
      throw new Error(`Route group "${name}" already exists`);
    }

    // Add route group
    fullConfig.RouteGroups.groups[name] = { ...config };

    // If this is the first route group, set it as active group
    if (Object.keys(fullConfig.RouteGroups.groups).length === 1) {
      fullConfig.RouteGroups.activeGroup = name;
    }

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /**
   * Delete a route group
   */
  static async deleteGroup(name: string, options: RouteGroupOptions = {}): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups?.groups[name]) {
      throw new Error(`Route group "${name}" does not exist`);
    }

    // If this is the currently active route group, need to switch to another group
    if (fullConfig.RouteGroups.activeGroup === name) {
      const groupNames = Object.keys(fullConfig.RouteGroups.groups).filter(n => n !== name);

      if (groupNames.length === 0) {
        throw new Error('Cannot delete the last route group');
      }

      const newActiveGroup = await select({
        message: `The active route group "${name}" will be deleted, please select a new active route group:`,
        choices: groupNames.map(n => ({ name: n, value: n }))
      });

      fullConfig.RouteGroups.activeGroup = newActiveGroup;
    }

    // Backup configuration
    if (!options.skipBackup) {
      await backupConfigFile();
    }

    // Delete route group
    delete fullConfig.RouteGroups.groups[name];

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /**
   * Update a route group
   */
  static async updateGroup(name: string, updates: Partial<RouteGroup>, options: RouteGroupOptions = {}): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups?.groups[name]) {
      throw new Error(`Route group "${name}" does not exist`);
    }

    // Merge updates
    const updatedGroup = { ...fullConfig.RouteGroups.groups[name], ...updates };

    // Validate updated configuration
    if (!options.skipValidation) {
      const validation = this.validateGroupConfig(updatedGroup, fullConfig.Providers);
      if (!validation.isValid) {
        console.log(`${YELLOW}⚠️  Updated route group "${name}" contains invalid configuration:${RESET}`);
        validation.invalidConfigs.forEach(config => {
          console.log(`   - ${config}`);
        });

        const shouldContinue = await confirm({
          message: 'Still update this route group? Invalid configurations will be cleaned up during switch',
          default: false
        });

        if (!shouldContinue) {
          console.log(`${YELLOW}Update cancelled${RESET}`);
          return;
        }
      }
    }

    // Backup configuration
    if (!options.skipBackup) {
      await backupConfigFile();
    }

    // Update route group
    fullConfig.RouteGroups.groups[name] = updatedGroup;

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /**
   * List all route groups
   */
  static listGroups(): { name: string; group: RouteGroup; isActive: boolean }[] {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups) {
      return [];
    }

    return Object.entries(fullConfig.RouteGroups.groups).map(([name, group]) => ({
      name,
      group,
      isActive: name === fullConfig.RouteGroups!.activeGroup
    }));
  }

  /**
   * Switch route group
   */
  static async switchGroup(name: string, options: SwitchGroupOptions = {}): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const group = fullConfig.RouteGroups?.groups[name];

    if (!group) {
      throw new Error(`Route group "${name}" does not exist`);
    }

    // Validate configuration
    const validation = this.validateGroupConfig(group, fullConfig.Providers);

    if (!validation.isValid) {
      console.log(`${YELLOW}⚠️  Route group "${name}" contains invalid configuration:${RESET}`);
      validation.invalidConfigs.forEach(config => {
        console.log(`   - ${config}`);
      });

      let shouldClean = options.cleanInvalid || false;

      if (!options.force && !options.cleanInvalid) {
        shouldClean = await confirm({
          message: 'Clean invalid configurations and continue switching?',
          default: false
        });
      }

      if (!shouldClean && !options.force) {
        console.log(`${YELLOW}Switch cancelled${RESET}`);
        return;
      }

      if (shouldClean) {
        // Clean invalid configurations
        const cleanedGroup = this.cleanInvalidConfigs(group, fullConfig.Providers);

        // Validate required configuration
        if (!cleanedGroup.default) {
          throw new Error('Required default configuration is missing after cleanup, cannot switch');
        }

        // Update route group configuration
        fullConfig.RouteGroups!.groups[name] = cleanedGroup;
      }
    }

    // Backup configuration
    await backupConfigFile();

    // Apply route group configuration to Router
    fullConfig.Router = { ...fullConfig.Router, ...group };
    fullConfig.RouteGroups!.activeGroup = name;

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
    console.log(`${GREEN}✓ Switched to route group "${name}"${RESET}`);
  }

  /**
   * Get the currently active route group
   */
  static getActiveGroup(): { name: string; group: RouteGroup } | null {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups) {
      return null;
    }

    const activeGroupName = fullConfig.RouteGroups.activeGroup;
    const activeGroup = fullConfig.RouteGroups.groups[activeGroupName];

    if (!activeGroup) {
      return null;
    }

    return { name: activeGroupName, group: activeGroup };
  }

  /**
   * Get route group by name
   */
  static getGroup(name: string): RouteGroup | null {
    const configPath = this.getConfigPath();
    const fullConfig: ExtendedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups?.groups[name]) {
      return null;
    }

    return fullConfig.RouteGroups.groups[name];
  }

  /**
   * Validate route group configuration
   */
  static validateGroupConfig(group: RouteGroup, providers: Provider[]): ValidationResult {
    const invalidConfigs: string[] = [];
    const providerModelMap = new Map<string, boolean>();

    // Build provider-model mapping
    providers.forEach(provider => {
      provider.models.forEach(model => {
        providerModelMap.set(`${provider.name},${model}`, true);
      });
    });

    // Check each configuration item
    Object.entries(group).forEach(([key, value]) => {
      if (key === 'longContextThreshold') return; // Skip numeric configuration

      if (value && typeof value === 'string' && !providerModelMap.has(value)) {
        invalidConfigs.push(`${key}: ${value}`);
      }
    });

    return {
      isValid: invalidConfigs.length === 0,
      invalidConfigs,
      cleanedConfigs: []
    };
  }

  /**
   * Clean invalid configurations
   */
  static cleanInvalidConfigs(group: RouteGroup, providers: Provider[]): RouteGroup {
    const cleaned: RouteGroup = { ...group };
    const providerModelMap = new Map<string, boolean>();

    // Build provider-model mapping
    providers.forEach(provider => {
      provider.models.forEach(model => {
        providerModelMap.set(`${provider.name},${model}`, true);
      });
    });

    // Clean invalid configurations
    Object.keys(cleaned).forEach(key => {
      if (key === 'longContextThreshold') return; // Keep numeric configuration

      const value = cleaned[key];
      if (value && typeof value === 'string' && !providerModelMap.has(value)) {
        delete cleaned[key];
      }
    });

    return cleaned;
  }

  /**
   * Get configuration file path
   */
  private static getConfigPath(): string {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude-code-router');
    const configPath = path.join(configDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      throw new Error(`config.json not found at ${configPath}`);
    }

    return configPath;
  }

  /**
   * Display route group details
   */
  static displayGroupInfo(groupName: string): void {
    const groups = this.listGroups();
    const groupInfo = groups.find(g => g.name === groupName);

    if (!groupInfo) {
      console.log(`${RED}Route group "${groupName}" does not exist${RESET}`);
      return;
    }

    console.log(`\n${BOLDGREEN}═══════════════════════════════════════════════${RESET}`);
    console.log(`${BOLDGREEN}           Route Group: ${groupName}${groupInfo.isActive ? ' (Active)' : ''}${RESET}`);
    console.log(`${BOLDGREEN}═══════════════════════════════════════════════${RESET}\n`);

    const formatModel = (modelValue: string | number | undefined) => {
      if (!modelValue || typeof modelValue === 'number') {
        return `${YELLOW}Not configured${RESET}`;
      }
      const [provider, model] = modelValue.split(',');
      return `${GREEN}${provider}${RESET} | ${model}`;
    };

    console.log(`${BOLDGREEN}Default Model:${RESET} ${formatModel(groupInfo.group.default)}`);

    if (groupInfo.group.background) {
      console.log(`${BOLDGREEN}Background Model:${RESET} ${formatModel(groupInfo.group.background)}`);
    }

    if (groupInfo.group.think) {
      console.log(`${BOLDGREEN}Think Model:${RESET} ${formatModel(groupInfo.group.think)}`);
    }

    if (groupInfo.group.longContext) {
      console.log(`${BOLDGREEN}Long Context Model:${RESET} ${formatModel(groupInfo.group.longContext)}`);
    }

    if (groupInfo.group.webSearch) {
      console.log(`${BOLDGREEN}Web Search Model:${RESET} ${formatModel(groupInfo.group.webSearch)}`);
    }

    if (groupInfo.group.image) {
      console.log(`${BOLDGREEN}Image Model:${RESET} ${formatModel(groupInfo.group.image)}`);
    }

    console.log(`\n${BOLDGREEN}═══════════════════════════════════════════════${RESET}\n`);
  }
}