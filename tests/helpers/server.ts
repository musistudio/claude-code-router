import { afterAll, beforeAll } from 'vitest';
import { join } from 'path';
import { ConfigService } from '../../packages/core/src/services/config';

export const TEST_PORT = 23456;
export const TEST_HOST = '127.0.0.1';
export const TEST_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

export function createTestConfigService(): ConfigService {
  const configPath = join(__dirname, '..', 'fixtures', 'config.test.json');
  return new ConfigService({ jsonPath: configPath });
}
