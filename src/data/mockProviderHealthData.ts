interface ProviderHealth {
  provider: string;
  status: 'online' | 'offline' | 'degraded';
  responseTime: number;
  lastCheck: string;
}

export let mockProviderHealth: ProviderHealth[] = [
  {
    provider: 'OpenAI',
    status: 'online',
    responseTime: 120,
    lastCheck: new Date().toISOString(),
  },
  {
    provider: 'Anthropic',
    status: 'degraded',
    responseTime: 543,
    lastCheck: new Date().toISOString(),
  },
  {
    provider: 'DeepSeek',
    status: 'offline',
    responseTime: 0,
    lastCheck: new Date().toISOString(),
  },
  {
    provider: 'Ollama',
    status: 'online',
    responseTime: 50,
    lastCheck: new Date().toISOString(),
  },
];
