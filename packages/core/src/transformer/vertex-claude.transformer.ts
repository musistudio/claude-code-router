import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import {
  buildRequestBody,
  transformRequestOut,
  transformResponseOut,
} from "../utils/vertex-claude.util";

async function getAccessToken(): Promise<string> {
  try {
    const { GoogleAuth } = await import('google-auth-library');

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token || '';
  } catch (error) {
    console.error('Error getting access token:', error);
    throw new Error('Failed to get access token for Vertex AI. Please ensure you have set up authentication using one of these methods:\n' +
      '1. Set GOOGLE_APPLICATION_CREDENTIALS to point to service account key file\n' +
      '2. Run "gcloud auth application-default login"\n' +
      '3. Use Google Cloud environment with default service account');
  }
}



export class VertexClaudeTransformer implements Transformer {
  name = "vertex-claude";

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Promise<Record<string, any>> {
    let projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-east5';

    if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const fs = await import('fs');
        const keyContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
        const credentials = JSON.parse(keyContent);
        if (credentials && credentials.project_id) {
          projectId = credentials.project_id;
        }
      } catch (error) {
        console.error('Error extracting project_id from GOOGLE_APPLICATION_CREDENTIALS:', error);
      }
    }

    if (!projectId) {
      throw new Error('Project ID is required for Vertex AI. Set GOOGLE_CLOUD_PROJECT environment variable or ensure project_id is in GOOGLE_APPLICATION_CREDENTIALS file.');
    }

    const accessToken = await getAccessToken();
    return {
      body: buildRequestBody(request),
      config: {
        url: new URL(
          `/v1/projects/${projectId}/locations/${location}/publishers/anthropic/models/${request.model}:${request.stream ? "streamRawPredict" : "rawPredict"}`,
          `https://${location}-aiplatform.googleapis.com`
        ).toString(),
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    };
  }

  async transformRequestOut(request: Record<string, any>): Promise<UnifiedChatRequest> {
    return transformRequestOut(request);
  }

  async transformResponseOut(response: Response): Promise<Response> {
    return transformResponseOut(response, this.name, this.logger);
  }
}
