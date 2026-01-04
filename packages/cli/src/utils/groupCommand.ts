import { select, input, confirm } from '@inquirer/prompts';
import { loadConfig, selectModel, selectModelType } from './modelSelector';
import { RouteGroupManager } from './routeGroupManager';
import { MODEL_TYPE_VALUES, RouterConfig} from '@CCR/shared';

// ANSI color codes
export const RESET = "\x1B[0m";
export const GREEN = "\x1B[32m";
export const YELLOW = "\x1B[33m";
export const RED = "\x1B[31m";
export const DIM = "\x1B[2m";
export const CYAN = "\x1B[36m";
export const BOLDGREEN = "\x1B[1m\x1B[32m";
export const BOLDYELLOW = "\x1B[1m\x1B[33m";
export const BOLDCYAN = "\x1B[1m\x1B[36m";

/**
 * Route Group Command Handler
 * Handles all route group related CLI commands
 */
export class GroupCommand {
  /**
   * Create a route group
   */
  static async create(groupName?: string): Promise<void> {
    try {
      console.clear();
      console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
      console.log(`${BOLDCYAN}              Create Route Group${RESET}`);
      console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);

      const name = groupName || await input({
        message: `${BOLDYELLOW}Enter route group name:${RESET}`,
        validate: (value: string) => {
          if (!value.trim()) {
            return 'Route group name cannot be empty';
          }
          return true;
        }
      });

      // Check if route group already exists
      const existingGroups = RouteGroupManager.listGroups();
      if (existingGroups.some(g => g.name === name)) {
        console.log(`${RED}Route group "${name}" already exists${RESET}`);
        return;
      }

      console.log(`\n${BOLDYELLOW}Please configure the model strategy for this route group:${RESET}\n`);

      // Use modelSelector to select model configuration
      const groupConfig = await this.createGroupConfig();

      // Create route group
      await RouteGroupManager.createGroup(name, groupConfig);

      console.log(`\n${GREEN}✓ Route group "${name}" created successfully!${RESET}\n`);

      // Ask if user wants to switch to the newly created route group immediately
      const shouldSwitch = await confirm({
        message: `${BOLDYELLOW}Switch to route group "${name}" now?${RESET}`,
        default: false
      });

      if (shouldSwitch) {
        await RouteGroupManager.switchGroup(name);
      }

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * List all route groups
   */
  static async list(): Promise<void> {
    try {
      console.clear();
      console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
      console.log(`${BOLDCYAN}              Route Group List${RESET}`);
      console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);

      const groups = RouteGroupManager.listGroups();

      if (groups.length === 0) {
        console.log(`${YELLOW}No route groups yet${RESET}`);
        console.log(`\nUse ${CYAN}ccr group create${RESET} to create your first route group`);
        return;
      }

      groups.forEach((group, index) => {
        const status = group.isActive ? `${GREEN}[Active]${RESET}` : '';
        console.log(`${index + 1}. ${BOLDCYAN}${group.name}${RESET} ${status}`);

        // Display other configurations
        MODEL_TYPE_VALUES.forEach(key => {
          const value = group.group[key];
          if (value && typeof value === 'string') {
            const [provider, model] = value.split(',');
            console.log(`   ${CYAN}${key.charAt(0).toUpperCase() + key.slice(1)}:${RESET} ${provider} | ${model}`);
          }
        });

        console.log('');
      });

      const activeGroup = RouteGroupManager.getActiveGroup();
      if (activeGroup) {
        console.log(`${BOLDGREEN}Current active route group: ${activeGroup.name}${RESET}`);
      }

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Switch route group
   */
  static async use(groupName?: string): Promise<void> {
    try {
      const groups = RouteGroupManager.listGroups();

      if (groups.length === 0) {
        console.log(`${YELLOW}No route groups${RESET}`);
        console.log(`\nUse ${CYAN}ccr group create${RESET} to create a route group`);
        return;
      }

      // If no route group name is specified, let user select
      let targetGroup = groupName;
      if (!targetGroup) {
        const choices = groups.map(g => ({
          name: `${g.name}${g.isActive ? ` ${GREEN}[Current]${RESET}` : ''}`,
          value: g.name
        }));

        targetGroup = await select({
          message: `${BOLDYELLOW}Select route group to switch to:${RESET}`,
          choices
        });
      }

      await RouteGroupManager.switchGroup(targetGroup);
      // 成功消息由 switchGroup 内部打印，无需重复

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Delete route group
   */
  static async delete(groupName?: string): Promise<void> {
    try {
      const groups = RouteGroupManager.listGroups();

      if (groups.length === 0) {
        console.log(`${YELLOW}No route groups${RESET}`);
        console.log(`\nUse ${CYAN}ccr group create${RESET} to create a route group`);
        return;
      }

      // If no route group name is specified, let user select
      let targetGroup = groupName;
      if (!targetGroup) {
        const choices = groups.map(g => ({
          name: `${g.name}${g.isActive ? ` ${GREEN}[Current]${RESET}` : ''}`,
          value: g.name
        }));

        targetGroup = await select({
          message: `${BOLDYELLOW}Select route group to delete:${RESET}`,
          choices
        });
      }

      // Confirm deletion
      const confirmDelete = await confirm({
        message: `${BOLDYELLOW}Delete route group "${targetGroup}"?${RESET}`,
        default: false
      });

      if (!confirmDelete) {
        console.log(`${YELLOW}Deletion cancelled${RESET}`);
        return;
      }

      await RouteGroupManager.deleteGroup(targetGroup);

      console.log(`\n${GREEN}✓ Route group "${targetGroup}" deleted${RESET}`);

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Edit route group
   */
  static async edit(groupName?: string): Promise<void> {
    try {
      const groups = RouteGroupManager.listGroups();

      if (groups.length === 0) {
        console.log(`${YELLOW}No route groups${RESET}`);
        console.log(`\nUse ${CYAN}ccr group create${RESET} to create a route group`);
        return;
      }

      // If no route group name is specified, let user select
      let targetGroup = groupName;
      if (!targetGroup) {
        const choices = groups.map(g => ({
          name: `${g.name}${g.isActive ? ` ${GREEN}[Current]${RESET}` : ''}`,
          value: g.name
        }));

        targetGroup = await select({
          message: `${BOLDYELLOW}Select route group to edit:${RESET}`,
          choices
        });
      }

      // Get current configuration
      const currentGroup = RouteGroupManager.getGroup(targetGroup);
      if (!currentGroup) {
        console.log(`${RED}Route group ${targetGroup} not found${RESET}`);
        return;
      }

      console.log(`\n${BOLDYELLOW}Current route group configuration:${RESET}`);
      RouteGroupManager.displayGroupInfo(targetGroup);

      console.log(`\n${BOLDYELLOW}Please update the model strategy for this route group:${RESET}\n`);

      // Use modelSelector to update model configuration
      const updatedConfig = await this.createGroupConfig();

      // Update route group configuration
      await RouteGroupManager.updateGroup(targetGroup, updatedConfig);

      console.log(`\n${GREEN}✓ Route group "${targetGroup}" updated successfully!${RESET}\n`);

      // Ask if user wants to reapply the updated configuration
      const shouldReapply = await confirm({
        message: `${BOLDYELLOW}Reapply the updated configuration?${RESET}`,
        default: false
      });

      if (shouldReapply) {
        await RouteGroupManager.switchGroup(targetGroup);
      }

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Show current route group
   */
  static async show(): Promise<void> {
    try {
      console.clear();

      const activeGroup = RouteGroupManager.getActiveGroup();

      if (!activeGroup) {
        console.log(`${YELLOW}No active route group${RESET}`);
        console.log(`\nUse ${CYAN}ccr group use${RESET} to activate a route group`);
        return;
      }

      RouteGroupManager.displayGroupInfo(activeGroup.name);

    } catch (error: any) {
      console.error(`${RED}Error:${RESET} ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Create route group configuration (via modelSelector)
   */
  private static async createGroupConfig(): Promise<RouterConfig> {
    const configFile = loadConfig();
    const groupConfig: RouterConfig = { default: '' };

    const formatValue = (value?: string | number) => {
      if (!value || typeof value === 'number') return `${DIM}Not configured${RESET}`;
      const [provider, model] = value.split(',');
      return `${YELLOW}${provider}${RESET} | ${model} ${DIM}- ${value}${RESET}`;
    };

    const printCurrent = () => {
      console.log(`\n${BOLDCYAN}Current route group configuration${RESET}`);
      MODEL_TYPE_VALUES.forEach(key => {
        const val = (groupConfig as any)[key];
        if (val) {
          console.log(`${key}: ${formatValue(val)}`);
        }
      });
      console.log('');
    };

    while (true) {
      console.clear();
      printCurrent();

      const type = await selectModelType(true);
      if (type === '__done__') {
        if (!groupConfig.default) {
          console.log(`${RED}default is required${RESET}`);
          continue;
        }
        return groupConfig;
      }

      const value = await selectModel(configFile, type);
      (groupConfig as any)[type] = value;
    }
  }
}