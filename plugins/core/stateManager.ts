import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

// In-memory state for plugins
let pluginState: { [key: string]: any } = {};

const stateFilePath = path.join(homedir(), '.claude-code-router', 'runtime-plugin-state.json');

export const savePluginState = async () => {
  try {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.writeFile(stateFilePath, JSON.stringify(pluginState, null, 2));
    console.log('Plugin state saved successfully.');
  } catch (error) {
    console.error('Failed to save plugin state:', error);
  }
};

export const loadPluginState = async () => {
  try {
    const data = await fs.readFile(stateFilePath, 'utf8');
    const persistedState = JSON.parse(data);
    console.log('LOADED PERSISTED STATE:', JSON.stringify(persistedState, null, 2));
    pluginState = { ...pluginState, ...persistedState };
    console.log('MERGED STATE AFTER LOAD:', JSON.stringify(pluginState, null, 2));
    console.log('Plugin state loaded successfully.');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('Plugin state file not found, state remains from initial config.');
    } else {
      console.error('Failed to load plugin state:', error);
    }
  }
};

export const initStateManager = async (app: any, initialPluginConfig: any) => {
  console.log('Initializing Plugin State Manager...');
  // 1. Start with the base config from config.json
  pluginState = initialPluginConfig || {};
  console.log('INITIAL CONFIG STATE:', JSON.stringify(pluginState, null, 2));

  // 2. Load persisted state from runtime file, which will override the base config
  await loadPluginState();

  // 3. Decorate the app with the final, merged state
  console.log('FINAL STATE BEFORE DECORATING:', JSON.stringify(pluginState, null, 2));
  app.decorate('pluginState', pluginState);

  app.get('/api/plugins/getState', async (request: any, reply: any) => {
    console.log('GET /api/plugins/getState called. Returning:', JSON.stringify(pluginState, null, 2));
    reply.send(pluginState);
  });

  app.post('/api/plugins/setState', async (request: any, reply: any) => {
    const { pluginId, enabled } = request.body;
    if (typeof pluginId !== 'string' || typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'Invalid payload. pluginId (string) and enabled (boolean) are required.' });
    }

    pluginState[pluginId] = { enabled };
    await savePluginState();
    reply.send({ message: `Plugin ${pluginId} state updated to enabled: ${enabled}` });
  });
};
