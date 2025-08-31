import axios from "axios";
import { setTimeout } from "timers/promises";
import os from "os";
import path from "path";
import fs from "fs/promises";

/**
 * Get OAuth credentials file path based on provider configuration
 * @param provider The provider configuration
 * @param config The full configuration object
 * @returns Path to OAuth credentials file
 */
function getOAuthFilePath(provider: any, config: any): string {
  // Check if provider has a transformer
  if (provider.transformer && provider.transformer.use && Array.isArray(provider.transformer.use)) {
    const transformerName = provider.transformer.use[0];
    
    // Find transformer in config
    const transformer = config.transformers?.find((t: any) => 
      t.path && path.basename(t.path, '.js') === transformerName
    );
    
    if (transformer) {
      // Check for custom OAuth file path in transformer options
      if (transformer.options?.oauth_file) {
        return transformer.options.oauth_file;
      }
      
      // Check for custom OAuth directory in transformer options
      if (transformer.options?.oauth_dir) {
        return path.join(transformer.options.oauth_dir, "oauth_creds.json");
      }
    }
  }
  
  // Default paths based on common patterns
  if (provider.name.includes("qwen")) {
    return path.join(os.homedir(), ".qwen", "oauth_creds.json");
  } else if (provider.name.includes("gemini")) {
    return path.join(os.homedir(), ".gemini", "oauth_creds.json");
  }
  
  // Fallback to generic path
  return path.join(os.homedir(), `.${provider.name}`, "oauth_creds.json");
}

/**
 * Test OAuth-managed provider connectivity
 * @param provider The provider configuration to test
 * @param config The full configuration object
 * @returns Test result with success status and response time
 */
async function testOAuthProvider(provider: any, config: any) {
  const startTime = Date.now();
  
  // Get OAuth file path
  const oauthFilePath = getOAuthFilePath(provider, config);
  
  try {
    // Read OAuth credentials
    const data = await fs.readFile(oauthFilePath, "utf-8");
    const oauthCreds = JSON.parse(data);
    
    // Check if token is expired
    if (oauthCreds.expiry_date && oauthCreds.expiry_date < Date.now()) {
      throw new Error("OAuth token expired");
    }
    
    // Determine API endpoint and headers based on provider URL
    const timeout = 10000;
    
    if (provider.api_base_url.includes("qwen.ai")) {
      // Qwen-specific test - use a minimal valid chat completion request
      await Promise.race([
        axios.post(provider.api_base_url, {
          "model": "qwen3-coder-plus", // Use a valid model name
          "messages": [{"role": "user", "content": "Hello"}],
          "max_tokens": 1
        }, {
          headers: {
            "Authorization": `Bearer ${oauthCreds.access_token}`,
            "Content-Type": "application/json",
            "User-Agent": "QwenCode/v22.12.0 (darwin; arm64)"
          },
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    } else if (provider.api_base_url.includes("googleapis.com") || provider.api_base_url.includes("cloudcode-pa.googleapis.com")) {
      // Gemini-specific test - use correct format for v1internal endpoint with colon separator
      const baseURL = provider.api_base_url.replace(/\/$/, ""); // Remove trailing slash if present
      const testUrl = baseURL.includes(":generateContent") ? 
        baseURL : 
        `${baseURL}:generateContent`;
      
      await Promise.race([
        axios.post(testUrl, {
          "request": {
            "contents": [{
              "role": "user",
              "parts": [{"text": "Hello"}]
            }]
          },
          "model": "gemini-2.5-flash",
          "project": config?.transformers?.find((t: any) => t.path?.includes("gemini-cli"))?.options?.project
        }, {
          headers: {
            "Authorization": `Bearer ${oauthCreds.access_token}`,
            "Content-Type": "application/json"
          },
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    } else {
      // Generic OAuth test - try a simple POST request
      await Promise.race([
        axios.post(provider.api_base_url, {
          "model": "test",
          "messages": [{"role": "user", "content": "test"}]
        }, {
          headers: {
            "Authorization": `Bearer ${oauthCreds.access_token}`,
            "Content-Type": "application/json"
          },
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    }
    
    return {
      providerName: provider.name,
      success: true,
      responseTime: Date.now() - startTime,
      error: null
    };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`OAuth credentials file not found at ${oauthFilePath}. Please authenticate with the service first.`);
    } else {
      throw err;
    }
  }
}

/**
 * Test regular API key provider connectivity
 * @param provider The provider configuration to test
 * @returns Test result with success status and response time
 */
async function testApiKeyProvider(provider: any, config: any) {
  const startTime = Date.now();
  let success = false;
  let error: string | null = null;
  let responseTime: number | null = null;

  try {
    // Skip providers without required information
    if (!provider.api_base_url || !provider.api_key) {
      throw new Error("Missing API base URL or API key");
    }

    // Create a test request based on the provider type
    let testResponse;
    const timeout = 10000; // 10 seconds timeout

    // Determine the appropriate test endpoint based on common provider patterns
    let testUrl = provider.api_base_url;
    const _n = String(provider?.name || '');
    const _isRovo = /rovo[-_ ]?cli/i.test(_n) || (provider?.api_base_url && /rovodev|atlassian\.com\/rovodev/i.test(provider.api_base_url)) || (provider?.transformer?.use && ([] as any[]).concat(provider.transformer.use).some((u: any) => (Array.isArray(u) ? String(u[0]) : String(u)).toLowerCase().includes('rovo-cli')));
    if (_isRovo) {
        const rovoTransformer = config?.transformers?.find((t: any) => t.path?.includes('rovo-cli'));
        if (!rovoTransformer?.path) throw new Error("Missing rovo-cli transformer");
        const Transformer = require(rovoTransformer.path);
        const instance = new Transformer(rovoTransformer.options || {});
        const reqBody = { model: (provider.models && provider.models[0]) || 'gpt-5-2025-08-07', messages: [{ role: 'user', content: 'Hello' }], max_tokens: 16 };
        const transformed = await instance.transformRequestIn(reqBody, provider);
        const axiosCfg = transformed?.config || {};
        const headers = { 'Content-Type': 'application/json', ...(axiosCfg.headers || {}) };
        const body = transformed?.body || reqBody;
        const maxAttempts = 3;
        let attempt = 0;
        while (true) {
          try {
            testResponse = await axios.post(provider.api_base_url, body, { ...axiosCfg, headers, timeout });
            break;
          } catch (e: any) {
            if (e?.response?.status === 429 && attempt < maxAttempts - 1) {
              const delay = 500 * Math.pow(2, attempt);
              await setTimeout(delay);
              attempt++;
              continue;
            }
            throw e;
          }
        }
    } else if (testUrl.includes("openai.com") || testUrl.includes("openai.azure.com")) {
      // OpenAI-style endpoint
      if (!testUrl.endsWith("/chat/completions") && !testUrl.endsWith("/completions")) {
        testUrl = testUrl.endsWith("/") ? testUrl + "chat/completions" : testUrl + "/chat/completions";
      }
      // Simple model listing request for OpenAI
      testResponse = await Promise.race([
        axios.get(testUrl.replace("/chat/completions", "/models").replace("/completions", "/models"), {
          headers: {
            "Authorization": `Bearer ${provider.api_key}`,
            "Content-Type": "application/json"
          },
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    } else if (testUrl.includes("anthropic.com")) {
      // Anthropic-style endpoint
      if (!testUrl.endsWith("/messages")) {
        testUrl = testUrl.endsWith("/") ? testUrl + "messages" : testUrl + "/messages";
      }
      // Simple test request for Anthropic
      testResponse = await Promise.race([
        axios.post(testUrl, {
          "model": "test",
          "messages": [{"role": "user", "content": "test"}],
          "max_tokens": 1
        }, {
          headers: {
            "x-api-key": provider.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
          },
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    } else if (testUrl.includes("googleapis.com")) {
      // Google-style endpoint
      testResponse = await Promise.race([
        axios.get(`${testUrl}?key=${provider.api_key}`, {
          timeout
        }),
        setTimeout(timeout).then(() => {
          throw new Error("Request timeout");
        })
      ]);
    } else {
      // Generic endpoint test - try a simple GET request first
      try {
        testResponse = await Promise.race([
          axios.get(testUrl, {
            headers: {
              "Authorization": `Bearer ${provider.api_key}`,
              "Content-Type": "application/json"
            },
            timeout
          }),
          setTimeout(timeout).then(() => {
            throw new Error("Request timeout");
          })
        ]);
      } catch (getErr) {
        // If GET fails, try a simple POST with minimal data
        testResponse = await Promise.race([
          axios.post(testUrl, {}, {
            headers: {
              "Authorization": `Bearer ${provider.api_key}`,
              "Content-Type": "application/json"
            },
            timeout
          }),
          setTimeout(timeout).then(() => {
            throw new Error("Request timeout");
          })
        ]);
      }
    }

    // If we get here without an exception, the test was successful
    success = true;
    responseTime = Date.now() - startTime;
  } catch (err: any) {
    if (err?.response) {
      try {
        const s = err.response.status;
        const d = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
        error = `${s}: ${d}`;
      } catch {
        error = err.message || "Unknown error";
      }
    } else {
      error = err.message || "Unknown error";
    }
    responseTime = Date.now() - startTime;
  }

  return {
    providerName: provider.name,
    success,
    responseTime,
    error
  };
}

/**
 * Test a single provider's connectivity
 * @param provider The provider configuration to test
 * @param config The full configuration object (optional, for OAuth providers)
 * @returns Test result with success status and response time
 */
export async function testProviderConnectivity(provider: any, config: any = null) {
  try {
    // Handle OAuth-managed providers
    if (provider.api_key === "oauth-managed") {
      return await testOAuthProvider(provider, config);
    } else {
      // Handle regular API key providers
      return await testApiKeyProvider(provider, config);
    }
  } catch (err: any) {
    return {
      providerName: provider.name,
      success: false,
      responseTime: Date.now() - Date.now(), // 0 response time for errors
      error: err.message || "Unknown error"
    };
  }
}

/**
 * Test all providers in the configuration
 * @param config The full configuration object
 * @returns Array of test results for each provider
 */
export async function testAllProviders(config: any) {
  if (!config.Providers || !Array.isArray(config.Providers)) {
    return [];
  }

  // Test all providers concurrently
  const testPromises = config.Providers.map(provider => 
    testProviderConnectivity(provider, config)
  );

  const results = await Promise.all(testPromises);
  return results;
}

/**
 * Test a specific provider by name
 * @param config The full configuration object
 * @param providerName The name of the provider to test
 * @returns Test result for the specified provider
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
