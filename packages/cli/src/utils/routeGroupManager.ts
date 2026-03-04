import * as fs from 'fs';
import * as path from 'path';
import { confirm, input, select } from '@inquirer/prompts';
import {
  RouterConfig,
  RouteGroupsConfig,
} from '@CCR/shared';
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
  static async createGroup(name: string, config: RouterConfig): Promise<void> {
    if (!name || name.trim() === '') {
      throw new Error('Route group name cannot be empty');
    }

    if (!config.default) {
      throw new Error('Route group must include default configuration');
    }

    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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
  static async deleteGroup(name: string): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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

    // Delete route group
    delete fullConfig.RouteGroups.groups[name];

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /**
   * Update a route group
   */
  static async updateGroup(name: string, updates: Partial<RouterConfig>): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups?.groups[name]) {
      throw new Error(`Route group "${name}" does not exist`);
    }

    // Merge updates
    const updatedGroup = { ...fullConfig.RouteGroups.groups[name], ...updates };

    // Update route group
    fullConfig.RouteGroups.groups[name] = updatedGroup;

    // Save configuration
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /**
   * List all route groups
   */
  static listGroups(): { name: string; group: RouterConfig; isActive: boolean }[] {
    const configPath = this.getConfigPath();
    const fullConfig: { RouteGroups: RouteGroupsConfig } = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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
  static async switchGroup(name: string): Promise<void> {
    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const group = fullConfig.RouteGroups?.groups[name];

    if (!group) {
      throw new Error(`Route group "${name}" does not exist`);
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
  static getActiveGroup(): { name: string; group: RouterConfig } | null {
    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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
  static getGroup(name: string): RouterConfig | null {
    const configPath = this.getConfigPath();
    const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!fullConfig.RouteGroups?.groups[name]) {
      return null;
    }

    return fullConfig.RouteGroups.groups[name];
  }

  /**
   * Clean invalid configurations
   */
  static cleanInvalidConfigs(group: RouterConfig, providers: Provider[]): RouterConfig {
    const cleaned: RouterConfig = { ...group };
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