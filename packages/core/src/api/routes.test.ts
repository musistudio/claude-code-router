import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerApiRoutes } from './routes';
import { ConfigService } from '../services/config';
import { ProviderService } from '../services/provider';
import { TransformerService } from '../services/transformer';
import { TokenizerService } from '../services/tokenizer';

describe('OpenAI Compatible Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    const configService = new ConfigService({
      initialConfig: {
        providers: [
          {
            name: 'mock-provider',
            api_base_url: 'http://localhost:9999',
            api_key: 'mock-key',
            models: ['mock-model'],
          },
        ],
      },
    });
    const transformerService = new TransformerService(configService, app.log);
    await transformerService.initialize();
    const providerService = new ProviderService(configService, transformerService, app.log);
    const tokenizerService = new TokenizerService(configService, app.log);
    await tokenizerService.initialize();

    app.decorate('configService', configService);
    app.decorate('providerService', providerService);
    app.decorate('transformerService', transformerService);
    app.decorate('tokenizerService', tokenizerService);

    await registerApiRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register /v1/chat/completions endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'mock-provider,mock-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    // Should fail because mock provider is not running, but endpoint should exist
    expect(response.statusCode).not.toBe(404);
  });

  it('should register /v1/messages endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: {
        model: 'mock-provider,mock-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(response.statusCode).not.toBe(404);
  });

  it('should return 404 for unknown provider', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'unknown,model',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error?.message || body.message || '').toContain("Provider 'unknown");
  });

  it('should list available models', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

describe('Provider Routing Scenarios', () => {
  it('should fallback to provider from model name when req.provider is missing', async () => {
    const app = Fastify();
    const configService = new ConfigService({
      initialConfig: {
        providers: [
          {
            name: 'kimi',
            api_base_url: 'http://localhost:9999',
            api_key: 'test-key',
            models: ['kimi-k2.6'],
          },
        ],
      },
    });
    const transformerService = new TransformerService(configService, app.log);
    await transformerService.initialize();
    const providerService = new ProviderService(configService, transformerService, app.log);
    const tokenizerService = new TokenizerService(configService, app.log);
    await tokenizerService.initialize();

    app.decorate('configService', configService);
    app.decorate('providerService', providerService);
    app.decorate('transformerService', transformerService);
    app.decorate('tokenizerService', tokenizerService);

    await registerApiRoutes(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'kimi,kimi-k2.6',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    // Should not be 404 (provider found via fallback)
    expect(response.statusCode).not.toBe(404);
    await app.close();
  });
});
