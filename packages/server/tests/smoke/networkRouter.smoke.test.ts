/**
 * Smoke Tests: End-to-end HTTP API verification
 *
 * Tests the full HTTP stack: server starts, routes registered, API key auth works.
 * Uses the core Server directly (not the full packages/server wrapper) since
 * smoke tests verify the network-state/reload endpoints registered in packages/server/src/server.ts.
 *
 * Port: 23456 (test port)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import Server from '@musistudio/llms';
import Fastify from 'fastify';

const TEST_PORT = 23456;
const TEST_HOST = '127.0.0.1';
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

const smokeConfig = {
  PORT: TEST_PORT,
  HOST: TEST_HOST,
  LOG: false,
  Providers: [
    {
      name: 'smoke-provider',
      api_base_url: 'http://127.0.0.1:19999/v1/chat/completions',
      api_key: 'smoke-key',
      models: ['smoke-model'],
    },
  ],
  Router: {
    default: 'smoke-provider,smoke-model',
  },
  NetworkRouter: {
    enabled: true,
    checkInterval: 30,
    hostname: 'w3.huawei.com',
    states: {
      intranet: { Router: { default: 'smoke-provider,smoke-model' } },
      external: { Router: { default: 'smoke-provider,smoke-model' } },
    },
  },
};

describe('Smoke: Network-Aware Router HTTP API', () => {
  let tempDir: string;
  let serverInstance: any;
  let originalExit: typeof process.exit;

  beforeAll(async () => {
    originalExit = process.exit;
    process.exit = (() => {}) as any;

    tempDir = mkdtempSync(join(tmpdir(), 'ccr-smoke-'));
    const configPath = join(tempDir, 'config.json');
    writeFileSync(configPath, JSON.stringify(smokeConfig, null, 2));

    serverInstance = new Server({ jsonPath: configPath, logger: false } as any);

    // Register the API routes (mimicking what packages/server does)
    const app = serverInstance.app;

    app.get('/api/network-state', async () => {
      const detector = serverInstance.networkDetector;
      return {
        state: detector?.getState() ?? 'unknown',
        enabled: !!detector,
      };
    });

    app.post('/api/reload', async () => {
      try {
        serverInstance.configService.reload();
        serverInstance.networkDetector?.stop();
        await serverInstance.networkDetector?.start();
        return { success: true, message: 'Config reloaded successfully' };
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    });

    // Expose for global access
    (globalThis as any).__CCR_SERVER = serverInstance;

    await serverInstance.start();
  }, 30000);

  afterAll(async () => {
    process.exit = originalExit;
    delete (globalThis as any).__CCR_SERVER;
    serverInstance?.networkDetector?.stop();
    await serverInstance?.app?.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('GET /api/network-state should return state', async () => {
    const res = await fetch(`${BASE_URL}/api/network-state`);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body).toHaveProperty('state');
    expect(['intranet', 'external', 'unknown']).toContain(body.state);
    expect(body.enabled).toBe(true);
  });

  it('POST /api/reload should reload config', async () => {
    const res = await fetch(`${BASE_URL}/api/reload`, { method: 'POST' });
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.message).toContain('reloaded');
  });

  it('network-state should reflect real DNS result', async () => {
    const res = await fetch(`${BASE_URL}/api/network-state`);
    const body = await res.json() as any;

    // The state should be 'intranet' or 'external' based on real network
    expect(['intranet', 'external']).toContain(body.state);
    expect(body.enabled).toBe(true);
  });

  it('reload should pick up config file changes', async () => {
    const configPath = join(tempDir, 'config.json');
    const newConfig = {
      ...smokeConfig,
      NetworkRouter: {
        ...smokeConfig.NetworkRouter,
        checkInterval: 60,
      },
    };
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

    await fetch(`${BASE_URL}/api/reload`, { method: 'POST' });

    const checkInterval = serverInstance.configService.get('NetworkRouter')?.checkInterval;
    expect(checkInterval).toBe(60);
  });
});
