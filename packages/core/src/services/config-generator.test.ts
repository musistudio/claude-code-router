import { describe, it, expect } from "vitest";
import { generateCcrConfig, parseYaml } from "./config-generator";

describe("parseYaml", () => {
  it("should parse simple key-value pairs", () => {
    const result = parseYaml("name: hello\nport: 8080");
    expect(result.name).toBe("hello");
    expect(result.port).toBe(8080);
  });

  it("should parse nested objects", () => {
    const result = parseYaml("server:\n  host: 0.0.0.0\n  port: 3000");
    expect(result.server.host).toBe("0.0.0.0");
    expect(result.server.port).toBe(3000);
  });

  it("should parse arrays with flow syntax", () => {
    const result = parseYaml("models: [gpt-4, o3, o4-mini]");
    expect(result.models).toEqual(["gpt-4", "o3", "o4-mini"]);
  });

  it("should parse list items with objects", () => {
    const yaml = `items:
  - name: a
    value: 1
  - name: b
    value: 2`;
    const result = parseYaml(yaml);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("a");
    expect(result.items[1].value).toBe(2);
  });

  it("should handle comments", () => {
    const result = parseYaml("# comment\nkey: val # inline");
    expect(result.key).toBe("val");
  });

  it("should parse booleans and nulls", () => {
    const result = parseYaml("a: true\nb: false\nc: null");
    expect(result.a).toBe(true);
    expect(result.b).toBe(false);
    expect(result.c).toBe(null);
  });

  it("should parse nested model_transformers", () => {
    const yaml = `transformers:
  o3: [openai, reasoning]
  deepseek-reasoner: [deepseek, reasoning]`;
    const result = parseYaml(yaml);
    expect(result.transformers.o3).toEqual(["openai", "reasoning"]);
    expect(result.transformers["deepseek-reasoner"]).toEqual(["deepseek", "reasoning"]);
  });
});

describe("generateCcrConfig", () => {
  it("should convert minimal YAML to CCR config", () => {
    const yaml = `
server:
  port: 3456
providers:
  - name: openai
    api_base_url: https://api.openai.com/v1/chat/completions
    api_key: test-key
    models: [gpt-4.1]
`;
    const config = generateCcrConfig(yaml);
    expect(config.PORT).toBe(3456);
    expect(config.Providers).toHaveLength(1);
    expect(config.Providers[0].name).toBe("openai");
    expect(config.Providers[0].models).toEqual(["gpt-4.1"]);
  });

  it("should handle transformer config", () => {
    const yaml = `
providers:
  - name: deepseek
    api_base_url: https://api.deepseek.com/v1/chat/completions
    api_key: test
    models: [deepseek-v4-pro]
    transformer: [deepseek]
    model_transformers:
      deepseek-reasoner: [deepseek, reasoning]
`;
    const config = generateCcrConfig(yaml);
    expect(config.Providers[0].transformer.use).toEqual(["deepseek"]);
    expect(config.Providers[0].transformer["deepseek-reasoner"]).toEqual({ use: ["deepseek", "reasoning"] });
  });

  it("should handle routing and model mapping", () => {
    const yaml = `
routing:
  default: openai,gpt-4.1
  think: deepseek,deepseek-reasoner
model_mapping:
  opus: deepseek,deepseek-reasoner
`;
    const config = generateCcrConfig(yaml);
    expect(config.Router.default).toBe("openai,gpt-4.1");
    expect(config.ModelMapping.opus).toBe("deepseek,deepseek-reasoner");
  });

  it("should handle fallback and concurrency", () => {
    const yaml = `
fallback:
  default:
    - "deepseek,deepseek-chat"
concurrency:
  global: 10
  providers:
    openai: 5
`;
    const config = generateCcrConfig(yaml);
    expect(config.fallback.default).toEqual(["deepseek,deepseek-chat"]);
    expect(config.Concurrency.global).toBe(10);
    expect(config.Concurrency.providers.openai).toBe(5);
  });

  it("should use defaults for empty input", () => {
    const config = generateCcrConfig("");
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.PORT).toBe(3456);
    expect(config.LOG).toBe(true);
    expect(config.API_TIMEOUT_MS).toBe(600000);
  });

  it("should handle full providers.example.yaml structure", () => {
    const yaml = `
server:
  host: 127.0.0.1
  port: 3456
  api_key: test-api-key
  log: true
  log_level: info
  timeout_ms: 600000

providers:
  - name: openai
    api_base_url: https://api.openai.com/v1/chat/completions
    api_key: sk-test
    models: [gpt-4.1, o3]
    transformer: [openai]
    priority: 10
    cost_tier: medium
    concurrency: 5
    model_transformers:
      o3: [openai, reasoning]

routing:
  default: openai,gpt-4.1
  think: deepseek,deepseek-reasoner

model_mapping:
  opus: deepseek,deepseek-reasoner

fallback:
  default:
    - "deepseek,deepseek-chat"

concurrency:
  global: 10
  providers:
    openai: 5
  queue_timeout_ms: 120000
`;
    const config = generateCcrConfig(yaml);

    expect(config.HOST).toBe("127.0.0.1");
    expect(config.PORT).toBe(3456);
    expect(config.APIKEY).toBe("test-api-key");
    expect(config.Providers).toHaveLength(1);
    expect(config.Providers[0].name).toBe("openai");
    expect(config.Providers[0].transformer.use).toEqual(["openai"]);
    expect(config.Providers[0].transformer.o3).toEqual({ use: ["openai", "reasoning"] });
    expect(config.Providers[0].priority).toBe(10);
    expect(config.Providers[0].cost_tier).toBe("medium");
    expect(config.Providers[0].concurrency_limit).toBe(5);
    expect(config.Router.default).toBe("openai,gpt-4.1");
    expect(config.ModelMapping.opus).toBe("deepseek,deepseek-reasoner");
    expect(config.fallback.default).toEqual(["deepseek,deepseek-chat"]);
    expect(config.Concurrency.global).toBe(10);
    expect(config.Concurrency.queueTimeoutMs).toBe(120000);
  });

  it("should handle provider without transformer", () => {
    const yaml = `
providers:
  - name: ollama
    api_base_url: http://localhost:11434/v1/chat/completions
    api_key: ollama
    models: [qwen3:8b]
    priority: 90
    cost_tier: free
    concurrency: 2
`;
    const config = generateCcrConfig(yaml);
    expect(config.Providers[0].transformer).toBeUndefined();
    expect(config.Providers[0].concurrency_limit).toBe(2);
    expect(config.Providers[0].cost_tier).toBe("free");
  });
});
