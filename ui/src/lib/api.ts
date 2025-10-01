import type { Config, Provider, Transformer } from '@/types';

// 日志聚合响应类型
interface GroupedLogsResponse {
  grouped: boolean;
  groups: { [reqId: string]: Array<{ timestamp: string; level: string; message: string; source?: string; reqId?: string }> };
  summary: {
    totalRequests: number;
    totalLogs: number;
    requests: Array<{
      reqId: string;
      logCount: number;
      firstLog: string;
      lastLog: string;
    }>;
  };
}

// API Client Class for handling requests with baseUrl and apikey authentication
class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private tempApiKey: string | null;

  constructor(baseUrl: string = '/api', apiKey: string = '') {
    this.baseUrl = baseUrl;
    // Load API key from localStorage if available
    this.apiKey = apiKey || localStorage.getItem('apiKey') || '';
    // Load temp API key from URL if available
    this.tempApiKey = new URLSearchParams(window.location.search).get('tempApiKey');
  }

  // Update base URL
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // Update API key
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    // Save API key to localStorage
    if (apiKey) {
      localStorage.setItem('apiKey', apiKey);
    } else {
      localStorage.removeItem('apiKey');
    }
  }
  
  // Update temp API key
  setTempApiKey(tempApiKey: string | null) {
    this.tempApiKey = tempApiKey;
  }

  // Create headers with API key authentication
  private createHeaders(contentType: string = 'application/json'): HeadersInit {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Use temp API key if available, otherwise use regular API key
    if (this.tempApiKey) {
      headers['X-Temp-API-Key'] = this.tempApiKey;
    } else if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    return headers;
  }

  // Generic fetch wrapper with base URL and authentication
  private async apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.createHeaders(),
        ...options.headers,
      },
    };
    
    try {
      const response = await fetch(url, config);
      
      // Handle 401 Unauthorized responses
      if (response.status === 401) {
        // Remove API key when it's invalid
        localStorage.removeItem('apiKey');
        // Redirect to login page if not already there
        // For memory router, we need to use the router instance
        // We'll dispatch a custom event that the app can listen to
        window.dispatchEvent(new CustomEvent('unauthorized'));
        // Return a promise that never resolves to prevent further execution
        return new Promise(() => {}) as Promise<T>;
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      if (response.status === 204) {
        return {} as T;
      }
      
      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);

    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'GET',
    });
  }

  // POST request
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // API methods for configuration
  // Get current configuration
  async getConfig(): Promise<Config> {
    return this.get<Config>('/config');
  }
  
  // Update entire configuration
  async updateConfig(config: Config): Promise<Config> {
    return this.post<Config>('/config', config);
  }
  
  // Get providers
  async getProviders(): Promise<Provider[]> {
    return this.get<Provider[]>('/api/providers');
  }
  
  // Add a new provider
  async addProvider(provider: Provider): Promise<Provider> {
    return this.post<Provider>('/api/providers', provider);
  }
  
  // Update a provider
  async updateProvider(index: number, provider: Provider): Promise<Provider> {
    return this.post<Provider>(`/api/providers/${index}`, provider);
  }
  
  // Delete a provider
  async deleteProvider(index: number): Promise<void> {
    return this.delete<void>(`/api/providers/${index}`);
  }
  
  // Get transformers
  async getTransformers(): Promise<Transformer[]> {
    return this.get<Transformer[]>('/api/transformers');
  }
  
  // Add a new transformer
  async addTransformer(transformer: Transformer): Promise<Transformer> {
    return this.post<Transformer>('/api/transformers', transformer);
  }
  
  // Update a transformer
  async updateTransformer(index: number, transformer: Transformer): Promise<Transformer> {
    return this.post<Transformer>(`/api/transformers/${index}`, transformer);
  }
  
  // Delete a transformer
  async deleteTransformer(index: number): Promise<void> {
    return this.delete<void>(`/api/transformers/${index}`);
  }
  
  // Get configuration (new endpoint)
  async getConfigNew(): Promise<Config> {
    return this.get<Config>('/config');
  }
  
  // Save configuration (new endpoint)
  async saveConfig(config: Config): Promise<unknown> {
    return this.post<Config>('/config', config);
  }
  
  // Restart service
  async restartService(): Promise<unknown> {
    return this.post<void>('/restart', {});
  }
  
  // Check for updates
  async checkForUpdates(): Promise<{ hasUpdate: boolean; latestVersion?: string; changelog?: string }> {
    return this.get<{ hasUpdate: boolean; latestVersion?: string; changelog?: string }>('/update/check');
  }
  
  // Perform update
  async performUpdate(): Promise<{ success: boolean; message: string }> {
    return this.post<{ success: boolean; message: string }>('/api/update/perform', {});
  }
  
  // Get log files list
  async getLogFiles(): Promise<Array<{ name: string; path: string; size: number; lastModified: string }>> {
    return this.get<Array<{ name: string; path: string; size: number; lastModified: string }>>('/logs/files');
  }
  
  // Get logs from specific file
  async getLogs(filePath: string): Promise<string[]> {
    return this.get<string[]>(`/logs?file=${encodeURIComponent(filePath)}`);
  }
  
  // Clear logs from specific file
  async clearLogs(filePath: string): Promise<void> {
    return this.delete<void>(`/logs?file=${encodeURIComponent(filePath)}`);
  }
}

// Create a default instance of the API client
export const api = new ApiClient();

// Export the class for creating custom instances
export default ApiClient;