import { GoogleAuth } from 'google-auth-library';
import { log } from './log';

interface VertexAICredentials {
  type: 'service_account' | 'application_default' | 'api_key';
  serviceAccountPath?: string;
  serviceAccountKey?: object;
  projectId?: string;
  location?: string;
}

class VertexAIAuthManager {
  private auth: GoogleAuth | null = null;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;
  private credentials: VertexAICredentials | null = null;

  /**
   * Initialize authentication with credentials
   */
  async initialize(credentials: VertexAICredentials): Promise<void> {
    this.credentials = credentials;

    try {
      if (credentials.type === 'service_account') {
        if (credentials.serviceAccountPath) {
          // Use service account file path
          this.auth = new GoogleAuth({
            keyFile: credentials.serviceAccountPath,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
        } else if (credentials.serviceAccountKey) {
          // Use service account key object
          this.auth = new GoogleAuth({
            credentials: credentials.serviceAccountKey,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
        } else {
          throw new Error('Service account path or key must be provided');
        }
      } else if (credentials.type === 'application_default') {
        // Use Application Default Credentials
        this.auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
      } else {
        throw new Error(`Unsupported authentication type: ${credentials.type}`);
      }

      // Verify authentication by getting a token
      await this.getAccessToken();
      log('Vertex AI authentication initialized successfully');
    } catch (error: any) {
      log('Failed to initialize Vertex AI authentication:', error.message);
      throw error;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.auth) {
      throw new Error('Authentication not initialized');
    }

    // Check if cached token is still valid (with 5 minute buffer)
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiry > now + 5 * 60 * 1000) {
      return this.cachedToken;
    }

    try {
      const accessToken = await this.auth.getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to obtain access token');
      }

      this.cachedToken = accessToken;
      // Tokens typically expire in 1 hour, cache for 55 minutes to be safe
      this.tokenExpiry = now + 55 * 60 * 1000;

      return accessToken;
    } catch (error: any) {
      log('Failed to get Vertex AI access token:', error.message);
      throw error;
    }
  }

  /**
   * Get the project ID from credentials or auth client
   */
  async getProjectId(): Promise<string> {
    if (this.credentials?.projectId) {
      return this.credentials.projectId;
    }

    if (!this.auth) {
      throw new Error('Authentication not initialized');
    }

    try {
      const projectId = await this.auth.getProjectId();
      if (!projectId) {
        throw new Error('Could not determine project ID');
      }
      return projectId;
    } catch (error: any) {
      log('Failed to get project ID:', error.message);
      throw error;
    }
  }

  /**
   * Get authorization headers for Vertex AI requests
   */
  async getAuthHeaders(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Build Vertex AI endpoint URL
   */
  buildEndpointUrl(
    projectId: string,
    location: string,
    publisher: string,
    model: string,
    action: string = 'generateContent'
  ): string {
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/${publisher}/models/${model}:${action}`;
  }

  /**
   * Build streaming endpoint URL
   */
  buildStreamingEndpointUrl(
    projectId: string,
    location: string,
    publisher: string,
    model: string
  ): string {
    return this.buildEndpointUrl(projectId, location, publisher, model, 'streamGenerateContent');
  }

  /**
   * Parse model name to extract publisher and model parts
   */
  parseModelName(modelName: string): { publisher: string; model: string } {
    // Handle different model name formats:
    // google/gemini-pro -> publisher: google, model: gemini-pro
    // anthropic/claude-3-sonnet -> publisher: anthropic, model: claude-3-sonnet
    // gemini-pro -> publisher: google, model: gemini-pro (default to google)
    
    if (modelName.includes('/')) {
      const [publisher, model] = modelName.split('/', 2);
      return { publisher, model };
    }
    
    // Default to google publisher for simple model names
    return { publisher: 'google', model: modelName };
  }

  /**
   * Refresh cached token
   */
  async refreshToken(): Promise<void> {
    this.cachedToken = null;
    this.tokenExpiry = 0;
    await this.getAccessToken();
  }

  /**
   * Check if authentication is properly configured
   */
  isConfigured(): boolean {
    return this.auth !== null;
  }
}

// Export singleton instance
export const vertexAuthManager = new VertexAIAuthManager();

// Export utility functions
export function parseVertexCredentials(config: any): VertexAICredentials | null {
  // Check for various credential configurations
  if (config.VERTEX_AI_SERVICE_ACCOUNT_PATH) {
    return {
      type: 'service_account',
      serviceAccountPath: config.VERTEX_AI_SERVICE_ACCOUNT_PATH,
      projectId: config.VERTEX_AI_PROJECT_ID,
      location: config.VERTEX_AI_LOCATION || 'us-central1',
    };
  }

  if (config.VERTEX_AI_SERVICE_ACCOUNT_KEY) {
    let serviceAccountKey;
    try {
      serviceAccountKey = typeof config.VERTEX_AI_SERVICE_ACCOUNT_KEY === 'string'
        ? JSON.parse(config.VERTEX_AI_SERVICE_ACCOUNT_KEY)
        : config.VERTEX_AI_SERVICE_ACCOUNT_KEY;
    } catch (error) {
      log('Invalid VERTEX_AI_SERVICE_ACCOUNT_KEY format');
      return null;
    }

    return {
      type: 'service_account',
      serviceAccountKey,
      projectId: config.VERTEX_AI_PROJECT_ID,
      location: config.VERTEX_AI_LOCATION || 'us-central1',
    };
  }

  if (config.VERTEX_AI_USE_ADC === true || config.VERTEX_AI_USE_ADC === 'true') {
    return {
      type: 'application_default',
      projectId: config.VERTEX_AI_PROJECT_ID,
      location: config.VERTEX_AI_LOCATION || 'us-central1',
    };
  }

  return null;
}