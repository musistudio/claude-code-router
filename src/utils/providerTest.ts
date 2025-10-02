import axios from "axios";
import { setTimeout as sleep } from "timers/promises";
import os from "os";
import path from "path";
import fs from "fs/promises";

// --- helpers ---
function classifyError(err: any): { code: string; httpStatus?: number; message: string } {
  // Axios error with response
  const status = err?.response?.status as number | undefined;
  if (status) {
    if (status === 401 || status === 403) return { code: "auth", httpStatus: status, message: err?.response?.data?.error?.message || err?.response?.data?.message || "Authentication failed" };
    if (status === 404) return { code: "not_found", httpStatus: status, message: "Endpoint/model not found" };
    if (status === 429) return { code: "rate_limited", httpStatus: status, message: "Rate limited" };
    if (status >= 500) return { code: "server", httpStatus: status, message: "Server error" };
    return { code: "api_error", httpStatus: status, message: err?.response?.data?.error?.message || err?.response?.data?.message || err.message || "API error" };
  }
  const ecode = String(err?.code || "").toUpperCase();
  if (ecode === "ECONNABORTED") return { code: "timeout", message: "Request timeout" };
  if (["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ECONNRESET"].includes(ecode)) return { code: "network", message: err.message || "Network error" };
  if (typeof err?.message === "string" && err.message.toLowerCase().includes("timeout")) return { code: "timeout", message: err.message };
  return { code: "unknown", message: err?.message || "Unknown error" };
}

function pickFirstModel(provider: any, fallback: string): string {
  if (Array.isArray(provider?.models) && provider.models.length > 0) return provider.models[0];
  return fallback;
}

/**
 * Get OAuth credentials file path based on provider configuration
 */
function getOAuthFilePath(provider: any, config: any): string {
  // Highest priority: provider.options overrides
  if (provider?.options?.oauth_file) {
    return provider.options.oauth_file;
  }
  if (provider?.options?.oauth_dir) {
    return path.join(provider.options.oauth_dir, "oauth_creds.json");
  }

  // Check if provider has a transformer
  if (provider.transformer && provider.transformer.use && Array.isArray(provider.transformer.use)) {
    const transformerName = provider.transformer.use[0];

    // Find transformer in config
    const transformer = config.transformers?.find((t: any) =>
      t.path && path.basename(t.path, '.js') === transformerName
    );

    if (transformer) {
      if (transformer.options?.oauth_file) {
        return transformer.options.oauth_file;
      }
      if (transformer.options?.oauth_dir) {
        return path.join(transformer.options.oauth_dir, "oauth_creds.json");
      }
    }
  }

  // Default paths based on common patterns
  if (String(provider.name || "").includes("qwen")) {
    return path.join(os.homedir(), ".qwen", "oauth_creds.json");
  } else if (String(provider.name || "").includes("gemini")) {
    return path.join(os.homedir(), ".gemini", "oauth_creds.json");
  }

  // Fallback to generic path
  return path.join(os.homedir(), `.${provider.name}`, "oauth_creds.json");
}

/**
 * Test OAuth-managed provider connectivity
 */
async function testOAuthProvider(provider: any, config: any) {
  const startTime = Date.now();
  const oauthFilePath = getOAuthFilePath(provider, config);
  const timeout = 10000;

  try {
    const data = await fs.readFile(oauthFilePath, "utf-8");
    const oauthCreds = JSON.parse(data);

    if (oauthCreds.expiry_date && oauthCreds.expiry_date < Date.now()) {
      return {
        providerName: provider.name,
        success: false,
        responseTime: Date.now() - startTime,
        error: "OAuth token expired",
        code: "auth",
      };
    }

    const apiBase = String(provider.api_base_url || "");

    if (apiBase.includes("qwen.ai")) {
      // Find the correct transformer by matching the provider's transformer configuration
      const providerTransformerName = Array.isArray(provider.transformer?.use)
        ? provider.transformer.use[0]
        : null;

      const transformerConfig = Array.isArray(config?.transformers)
        ? config.transformers.find((t: any) => t.name === providerTransformerName)
        : null;

      if (transformerConfig?.path) {
        let QwenCLITransformer: any;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          QwenCLITransformer = require(transformerConfig.path);
        } catch (e) {
          const ex = new Error("Failed to load qwen-cli transformer module");
          (ex as any).code = "config";
          throw ex;
        }

        // Create instance and follow the exact same flow as in actual requests
        const instance = new QwenCLITransformer();
        // Call transformRequestIn with a mock request to trigger the same auth flow
        const mockRequest = {
          model: pickFirstModel(provider, "qwen3-coder-plus"),
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 1
        };

        // This will trigger getOauthCreds() and refreshToken() if needed, exactly as in actual requests
        const transformed = await instance.transformRequestIn(mockRequest, provider);

        // Use the token from the transformed request headers
        const token = transformed.config.headers.Authorization.replace('Bearer ', '');
        const model = pickFirstModel(provider, "qwen3-coder-plus");

        await axios.post(apiBase, {
          model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 1,
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "QwenCode/v22.12.0 (darwin; arm64)",
          },
          timeout,
        });
      } else {
        // Fallback to file-based approach if transformer not found
        const model = pickFirstModel(provider, "qwen3-coder-plus");
        await axios.post(apiBase, {
          model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 1,
        }, {
          headers: {
            Authorization: `Bearer ${oauthCreds.access_token}`,
            "Content-Type": "application/json",
            "User-Agent": "QwenCode/v22.12.0 (darwin; arm64)",
          },
          timeout,
        });
      }
    } else if (apiBase.includes("googleapis.com") || apiBase.includes("cloudcode-pa.googleapis.com")) {
      const baseURL = apiBase.replace(/\/$/, "");
      const testUrl = baseURL.includes(":generateContent") ? baseURL : `${baseURL}:generateContent`;
      const model = pickFirstModel(provider, "gemini-2.5-flash");
      await axios.post(testUrl, {
        request: {
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        },
        model,
        project: config?.transformers?.find((t: any) => t.path?.includes("gemini-cli"))?.options?.project,
      }, {
        headers: {
          Authorization: `Bearer ${oauthCreds.access_token}`,
          "Content-Type": "application/json",
        },
        timeout,
      });
    } else {
      await axios.post(apiBase, {
        model: pickFirstModel(provider, "test"),
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }, {
        headers: {
          Authorization: `Bearer ${oauthCreds.access_token}`,
          "Content-Type": "application/json",
        },
        timeout,
      });
    }

    return {
      providerName: provider.name,
      success: true,
      responseTime: Date.now() - startTime,
      error: null,
    };
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return {
        providerName: provider.name,
        success: false,
        responseTime: Date.now() - startTime,
        error: `OAuth credentials file not found at ${oauthFilePath}. Please authenticate first.`,
        code: "config",
      };
    }
    const cls = classifyError(err);
    return {
      providerName: provider.name,
      success: false,
      responseTime: Date.now() - startTime,
      error: cls.message,
      code: cls.code,
      httpStatus: cls.httpStatus,
    };
  }
}

/**
 * Test regular API key provider connectivity
 */
async function testApiKeyProvider(provider: any, config: any) {
  const startTime = Date.now();
  let success = false;
  let error: string | null = null;
  let responseTime: number | null = null;
  let code: string | undefined;
  let httpStatus: number | undefined;

  try {
    if (!provider.api_base_url || !provider.api_key) {
      throw new Error("Missing API base URL or API key");
    }

    let testResponse;
    const timeout = 10000; // 10 seconds timeout

    let testUrl = provider.api_base_url as string;
    const _n = String(provider?.name || '');
    const _isRovo = /rovo[-_ ]?cli/i.test(_n) || (provider?.api_base_url && /rovodev|atlassian\.com\/rovodev/i.test(provider.api_base_url)) || (provider?.transformer?.use && ([] as any[]).concat(provider.transformer.use).some((u: any) => (Array.isArray(u) ? String(u[0]) : String(u)).toLowerCase().includes('rovo-cli')));
    if (_isRovo) {
      const rovoTransformer = config?.transformers?.find((t: any) => t.path?.includes('rovo-cli'));
      if (!rovoTransformer?.path) {
        const e = new Error("Missing rovo-cli transformer");
        (e as any).code = "config";
        throw e;
      }
      let Transformer: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        Transformer = require(rovoTransformer.path);
      } catch (e) {
        const ex = new Error("Failed to load rovo-cli transformer module");
        (ex as any).code = "config";
        throw ex;
      }
      const instance = new Transformer(rovoTransformer.options || {});
      const reqBody = { model: pickFirstModel(provider, 'gpt-5-2025-08-07'), messages: [{ role: 'user', content: 'Hello' }], max_tokens: 16 };
      const transformed = await instance.transformRequestIn(reqBody, provider);
      const axiosCfg = transformed?.config || {};
      const headers = { 'Content-Type': 'application/json', ...(axiosCfg.headers || {}) };
      const body = transformed?.body || reqBody;
      const maxAttempts = 3;
      let attempt = 0;
      // retry with jitter on 429
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          testResponse = await axios.post(provider.api_base_url, body, { ...axiosCfg, headers, timeout });
          break;
        } catch (e: any) {
          if (e?.response?.status === 429 && attempt < maxAttempts - 1) {
            const base = 500 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 200);
            await sleep(base + jitter);
            attempt++;
            continue;
          }
          throw e;
        }
      }
    } else if (testUrl.includes("openai.com") || testUrl.includes("openai.azure.com")) {
      if (!testUrl.endsWith("/chat/completions") && !testUrl.endsWith("/completions")) {
        testUrl = testUrl.endsWith("/") ? testUrl + "chat/completions" : testUrl + "/chat/completions";
      }
      testResponse = await axios.get(testUrl.replace("/chat/completions", "/models").replace("/completions", "/models"), {
        headers: {
          Authorization: `Bearer ${provider.api_key}`,
          "Content-Type": "application/json",
        },
        timeout,
      });
    } else if (testUrl.includes("anthropic.com")) {
      if (!testUrl.endsWith("/messages")) {
        testUrl = testUrl.endsWith("/") ? testUrl + "messages" : testUrl + "/messages";
      }
      testResponse = await axios.post(testUrl, {
        model: pickFirstModel(provider, "test"),
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }, {
        headers: {
          "x-api-key": provider.api_key,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        timeout,
      });
    } else if (testUrl.includes("googleapis.com")) {
      // Do not log URL with key anywhere
      testResponse = await axios.get(`${testUrl}?key=${provider.api_key}`, { timeout });
    } else {
      try {
        testResponse = await axios.get(testUrl, {
          headers: {
            Authorization: `Bearer ${provider.api_key}`,
            "Content-Type": "application/json",
          },
          timeout,
        });
      } catch (getErr) {
        const payload = testUrl.includes("/chat/completions") ? {
          model: pickFirstModel(provider, "test"),
          messages: [{ role: "user", content: "test" }],
          max_tokens: 1,
        } : {};
        testResponse = await axios.post(testUrl, payload, {
          headers: {
            Authorization: `Bearer ${provider.api_key}`,
            "Content-Type": "application/json",
          },
          timeout,
        });
      }
    }

    success = true;
    responseTime = Date.now() - startTime;
  } catch (err: any) {
    const cls = classifyError(err);
    error = cls.message;
    code = cls.code;
    httpStatus = cls.httpStatus;
    responseTime = Date.now() - startTime;
  }

  return {
    providerName: provider.name,
    success,
    responseTime,
    error,
    code,
    httpStatus,
  };
}

/**
 * Test a single provider's connectivity
 */
export async function testProviderConnectivity(provider: any, config: any = null) {
  if (provider.api_key === "oauth-managed") {
    return await testOAuthProvider(provider, config);
  } else {
    return await testApiKeyProvider(provider, config);
  }
}

/**
 * Test all providers in the configuration
 */
export async function testAllProviders(config: any) {
  if (!config.Providers || !Array.isArray(config.Providers)) {
    return [];
  }

  const testPromises = config.Providers.map((provider: any) =>
    testProviderConnectivity(provider, config)
  );

  const results = await Promise.all(testPromises);
  return results;
}

/**
 * Test a specific provider by name
 */
export async function testSpecificProvider(config: any, providerName: string) {
  if (!config.Providers || !Array.isArray(config.Providers)) {
    throw new Error("No providers configured");
  }

  const provider = config.Providers.find((p: any) => p.name === providerName);
  if (!provider) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  return await testProviderConnectivity(provider, config);
}
