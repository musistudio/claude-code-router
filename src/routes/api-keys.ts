import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { configureGeminiRateLimit } from '../middleware/gemini-rate-limit';
import { info, warn, error } from '../utils/log';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { HOME_DIR } from '../constants';

const API_KEYS_FILE = join(HOME_DIR, 'api_keys.json');

// --- Data Structures ---

export interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
  provider: string;
  isEnabled: boolean;
  createdAt: string;
  lastUsed?: string;
  requestCount: number;
  errorCount: number;
  isTemporarilyBlocked: boolean;
  blockReason?: string;
}

// In-memory storage for API keys and their stats
const apiKeys: Map<string, ApiKeyInfo> = new Map();
const keyStats: Map<string, any> = new Map(); // Using any for stats to be flexible

// New in-memory storage for time-series usage data
const keyUsageHistory: Map<string, { timestamp: number; count: number }[]> = new Map();
const HISTORY_LENGTH_MINUTES = 60; // Store last 60 minutes of data
const AGGREGATION_WINDOW_MS = 60 * 1000; // 1 minute

// --- Persistence Functions ---

async function readApiKeysFile(): Promise<ApiKeyInfo[]> {
  try {
    const data = await readFile(API_KEYS_FILE, 'utf-8');
    return JSON.parse(data) as ApiKeyInfo[];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      info('[ApiKeyManager] api_keys.json not found. Starting with an empty set of keys.');
      return [];
    }
    error(`[ApiKeyManager] Error reading API keys file: ${err.message}`);
    return [];
  }
}

async function writeApiKeysFile(): Promise<void> {
  try {
    const keysArray = Array.from(apiKeys.values());
    await writeFile(API_KEYS_FILE, JSON.stringify(keysArray, null, 2));
  } catch (err: any) {
    error(`[ApiKeyManager] Error writing API keys file: ${err.message}`);
  }
}

async function loadPersistedKeys() {
  const persistedKeys = await readApiKeysFile();
  apiKeys.clear();
  keyStats.clear();
  keyUsageHistory.clear();

  persistedKeys.forEach(keyInfo => {
    apiKeys.set(keyInfo.key, keyInfo);
    keyStats.set(keyInfo.key, { totalRequests: 0, successfulRequests: 0, failedRequests: 0 });
    keyUsageHistory.set(keyInfo.key, []);
  });
  info(`[ApiKeyManager] Loaded ${apiKeys.size} keys from api_keys.json`);
}

// --- Core Logic ---

function updateRateLimiterConfig() {
  const activeKeys = Array.from(apiKeys.values())
    .filter(key => key.isEnabled && !key.isTemporarilyBlocked && key.provider === 'gemini')
    .map(key => key.key);

  info(`[ApiKeyManager] Updating Gemini Rate Limiter with ${activeKeys.length} active keys.`);
  
  configureGeminiRateLimit({
    minDelayMs: 1500,
    maxRetries: 3,
    maxQueueSize: 50,
    apiKeyRotation: activeKeys.length > 0,
    apiKeys: activeKeys
  });
}

export function trackKeyUsage(apiKey: string, success: boolean, responseTime?: number) {
  if (!apiKeys.has(apiKey)) return;

  const keyInfo = apiKeys.get(apiKey)!;
  const stats = keyStats.get(apiKey)!;
  
  // Update overall stats
  keyInfo.requestCount++;
  keyInfo.lastUsed = new Date().toISOString();
  stats.totalRequests++;
  if (success) {
    stats.successfulRequests++;
  } else {
    stats.failedRequests++;
    keyInfo.errorCount++;
  }
  
  // Update time-series history
  const now = Date.now();
  const currentWindow = Math.floor(now / AGGREGATION_WINDOW_MS) * AGGREGATION_WINDOW_MS;
  const history = keyUsageHistory.get(apiKey)!;
  
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && lastEntry.timestamp === currentWindow) {
    lastEntry.count++;
  } else {
    history.push({ timestamp: currentWindow, count: 1 });
  }

  // Prune old history
  while (history.length > 0 && history[0].timestamp < now - (HISTORY_LENGTH_MINUTES * AGGREGATION_WINDOW_MS)) {
    history.shift();
  }

  // Auto-block logic
  if (keyInfo.errorCount > 10 && (keyInfo.errorCount / keyInfo.requestCount) > 0.5) {
    keyInfo.isTemporarilyBlocked = true;
    keyInfo.blockReason = 'Auto-blocked due to high error rate';
    warn(`[ApiKeyManager] Auto-blocked key ${keyInfo.name} due to high error rate`);
    updateRateLimiterConfig();
    writeApiKeysFile();
  }
}

// --- API Routes ---

export default async function apiKeysRoutes(fastify: FastifyInstance) {
  await loadPersistedKeys();
  updateRateLimiterConfig();
  
  fastify.get('/api/keys/usage-history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const allTimestamps = new Set<number>();
      keyUsageHistory.forEach(history => {
        history.forEach(item => allTimestamps.add(item.timestamp));
      });

      const sortedTimestamps = Array.from(allTimestamps).sort();

      const chartData = sortedTimestamps.map(timestamp => {
        const dataPoint: { [key: string]: number | string } = { 
          timestamp: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        };
        apiKeys.forEach(apiKey => {
          const history = keyUsageHistory.get(apiKey.key) || [];
          const usage = history.find(item => item.timestamp === timestamp);
          dataPoint[apiKey.name] = usage ? usage.count : 0;
        });
        return dataPoint;
      });

      const keyNames = Array.from(apiKeys.values()).map(k => k.name);

      return { success: true, data: { chartData, keyNames } };
    } catch (err: any) {
      error(`[ApiKeyManager] Error fetching usage history: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.get('/api/keys', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const keys = Array.from(apiKeys.values()).map(key => ({
        ...key,
        key: key.key.substring(0, 12) + '...' + key.key.substring(key.key.length - 4),
        stats: keyStats.get(key.key)
      }));
      
      return {
        success: true,
        data: keys,
      };
    } catch (err: any) {
      error(`[ApiKeyManager] Error fetching keys: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/api/keys', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, key, provider = 'gemini' } = request.body as any;
      
      if (!name || !key) {
        return reply.status(400).send({ success: false, error: 'Name and key are required' });
      }
      
      if (apiKeys.has(key)) {
        return reply.status(409).send({ success: false, error: 'Key already exists' });
      }
      
      const keyInfo: ApiKeyInfo = {
        id: `${provider}-${Date.now()}`,
        name,
        key,
        provider,
        isEnabled: true,
        createdAt: new Date().toISOString(),
        requestCount: 0,
        errorCount: 0,
        isTemporarilyBlocked: false
      };
      
      apiKeys.set(keyInfo.key, keyInfo);
      keyStats.set(keyInfo.key, { totalRequests: 0, successfulRequests: 0, failedRequests: 0 });
      keyUsageHistory.set(keyInfo.key, []); // Initialize history
      
      await writeApiKeysFile();
      updateRateLimiterConfig();
      info(`[ApiKeyManager] Added new API key: ${name}`);
      
      return {
        success: true,
        message: 'API key added successfully',
        data: { ...keyInfo, key: key.substring(0, 12) + '...' + key.substring(key.length - 4) }
      };
    } catch (err: any) {
      error(`[ApiKeyManager] Error adding key: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.put('/api/keys/:keyId/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { keyId } = request.params as any;
      const keyInfo = Array.from(apiKeys.values()).find(k => k.id === keyId);

      if (!keyInfo) {
        return reply.status(404).send({ success: false, error: 'Key not found' });
      }
      
      keyInfo.isEnabled = !keyInfo.isEnabled;
      await writeApiKeysFile();
      updateRateLimiterConfig();
      
      info(`[ApiKeyManager] ${keyInfo.isEnabled ? 'Enabled' : 'Disabled'} key: ${keyInfo.name}`);
      return { success: true, message: `Key ${keyInfo.isEnabled ? 'enabled' : 'disabled'} successfully` };
    } catch (err: any) {
      error(`[ApiKeyManager] Error toggling key: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.put('/api/keys/:keyId/block', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { keyId } = request.params as any;
      const { reason } = request.body as any;
      const keyInfo = Array.from(apiKeys.values()).find(k => k.id === keyId);

      if (!keyInfo) {
        return reply.status(404).send({ success: false, error: 'Key not found' });
      }
      
      keyInfo.isTemporarilyBlocked = !keyInfo.isTemporarilyBlocked;
      keyInfo.blockReason = keyInfo.isTemporarilyBlocked ? (reason || 'Manually blocked') : undefined;
      
      await writeApiKeysFile();
      updateRateLimiterConfig();
      
      info(`[ApiKeyManager] ${keyInfo.isTemporarilyBlocked ? 'Blocked' : 'Unblocked'} key: ${keyInfo.name}`);
      return { success: true, message: `Key ${keyInfo.isTemporarilyBlocked ? 'blocked' : 'unblocked'} successfully` };
    } catch (err: any) {
      error(`[ApiKeyManager] Error blocking/unblocking key: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/api/keys/:keyId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { keyId } = request.params as any;
      const keyInfo = Array.from(apiKeys.values()).find(k => k.id === keyId);

      if (!keyInfo) {
        return reply.status(404).send({ success: false, error: 'Key not found' });
      }
      
      apiKeys.delete(keyInfo.key);
      keyStats.delete(keyInfo.key);
      keyUsageHistory.delete(keyInfo.key); // Remove history
      
      await writeApiKeysFile();
      updateRateLimiterConfig();
      
      info(`[ApiKeyManager] Deleted key: ${keyInfo.name}`);
      return { success: true, message: 'Key deleted successfully' };
    } catch (err: any) {
      error(`[ApiKeyManager] Error deleting key: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.get('/api/keys/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const allStats = Array.from(keyStats.entries()).map(([key, stats]) => ({
        keyInfo: apiKeys.get(key),
        stats
      }));
      
      const totalStats = {
        totalKeys: apiKeys.size,
        activeKeys: Array.from(apiKeys.values()).filter(k => k.isEnabled && !k.isTemporarilyBlocked).length,
        blockedKeys: Array.from(apiKeys.values()).filter(k => k.isTemporarilyBlocked).length,
        disabledKeys: Array.from(apiKeys.values()).filter(k => !k.isEnabled).length,
        totalRequests: allStats.reduce((sum, s) => sum + s.stats.totalRequests, 0),
        successfulRequests: allStats.reduce((sum, s) => sum + s.stats.successfulRequests, 0),
        failedRequests: allStats.reduce((sum, s) => sum + s.stats.failedRequests, 0)
      };
      
      return {
        success: true,
        data: {
          summary: totalStats,
          keyDetails: allStats.map(s => ({
            id: s.keyInfo?.id,
            name: s.keyInfo?.name,
            provider: s.keyInfo?.provider,
            isEnabled: s.keyInfo?.isEnabled,
            isBlocked: s.keyInfo?.isTemporarilyBlocked,
            requestCount: s.keyInfo?.requestCount || 0,
            errorCount: s.keyInfo?.errorCount || 0,
            lastUsed: s.stats.lastUsed,
            successRate: s.stats.totalRequests > 0 ? (s.stats.successfulRequests / s.stats.totalRequests * 100).toFixed(1) : '0'
          }))
        }
      };
    } catch (err: any) {
      error(`[ApiKeyManager] Error fetching stats: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}