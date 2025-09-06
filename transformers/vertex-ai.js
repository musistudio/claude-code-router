const { vertexAuthManager, parseVertexCredentials } = require('../dist/utils/vertexAuth');

/**
 * Vertex AI transformer for common models
 * Supports Gemini and Claude models on Vertex AI
 */
class VertexAITransformer {
  constructor(options = {}) {
    this.name = 'vertex-ai';
    this.options = {
      projectId: options.projectId || process.env.VERTEX_AI_PROJECT_ID,
      location: options.location || process.env.VERTEX_AI_LOCATION || 'us-central1',
      useStreaming: options.useStreaming !== false,
      ...options
    };

    this.initialized = false;
  }

  /**
   * Parse model name to extract publisher and model information
   */
  parseModelName(modelName) {
    // Handle publisher/model format (e.g., "google/gemini-pro", "anthropic/claude-3-sonnet")
    if (modelName.includes('/')) {
      const [publisher, model] = modelName.split('/', 2);
      return { publisher, model, type: this.guessModelType(model, publisher) };
    }
    
    // For simple model names, guess the publisher and type
    const publisher = this.guessPublisher(modelName);
    const type = this.guessModelType(modelName, publisher);
    
    return { publisher, model: modelName, type };
  }

  /**
   * Guess publisher from model name
   */
  guessPublisher(modelName) {
    const name = modelName.toLowerCase();
    
    if (name.includes('claude')) return 'anthropic';
    if (name.includes('gemini')) return 'google';
    
    // Default to google for unknown models
    return 'google';
  }

  /**
   * Guess model type from model name and publisher
   */
  guessModelType(modelName, publisher) {
    const name = modelName.toLowerCase();
    
    if (publisher === 'anthropic') return 'claude';
    if (name.includes('gemini')) return 'gemini';
    
    // Default to gemini for google models
    return publisher === 'google' ? 'gemini' : 'claude';
  }

  /**
   * Initialize the transformer with authentication
   */
  async initialize(config) {
    if (this.initialized) return;

    try {
      // Initialize authentication
      const credentials = parseVertexCredentials(config);
      if (!credentials) {
        throw new Error('Vertex AI credentials not found in configuration');
      }

      await vertexAuthManager.initialize(credentials);
      
      this.initialized = true;
      console.log('Vertex AI transformer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Vertex AI transformer:', error.message);
      throw error;
    }
  }

  /**
   * Transform OpenAI request to Vertex AI format
   */
  async transformRequestIn(request, config) {
    if (!this.initialized) {
      await this.initialize(config);
    }

    try {
      const modelInfo = this.parseModelName(request.body.model);

      const authHeaders = await vertexAuthManager.getAuthHeaders();
      const projectId = await vertexAuthManager.getProjectId();

      // Build the endpoint URL
      const baseUrl = request.url || '';
      const isStreaming = baseUrl.includes('stream') || this.options.useStreaming;
      const action = isStreaming ? 'streamGenerateContent' : 'generateContent';
      
      const url = vertexAuthManager.buildEndpointUrl(
        projectId,
        this.options.location,
        modelInfo.publisher,
        modelInfo.name,
        action
      );

      // Transform the request based on model type
      let transformedBody;
      switch (modelInfo.type) {
        case 'gemini':
          transformedBody = this.transformGeminiRequest(request.body);
          break;
        case 'claude':
          transformedBody = this.transformClaudeRequest(request.body);
          break;
        default:
          // Default to Gemini format for unknown types
          transformedBody = this.transformGeminiRequest(request.body);
      }

      return {
        ...request,
        url,
        headers: {
          ...request.headers,
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: transformedBody,
        vertexModelInfo: modelInfo, // Pass model info for response transformation
      };
    } catch (error) {
      console.error('Error transforming Vertex AI request:', error);
      throw error;
    }
  }

  /**
   * Transform Vertex AI response to OpenAI format
   */
  async transformResponseOut(response, request) {
    try {
      // Handle streaming responses
      if (response.headers.get('content-type')?.includes('text/plain') || 
          response.headers.get('transfer-encoding') === 'chunked') {
        return this.transformStreamingResponse(response, request);
      }

      const data = await response.json();
      const modelInfo = request.vertexModelInfo;
      
      // Transform based on the model type that was used
      switch (modelInfo?.type) {
        case 'gemini':
          return this.transformGeminiResponse(data);
        case 'claude':
          return this.transformClaudeResponse(data);
        default:
          return this.transformGeminiResponse(data);
      }
    } catch (error) {
      console.error('Error transforming Vertex AI response:', error);
      return response;
    }
  }


  /**
   * Transform request for Gemini models
   */
  transformGeminiRequest(requestBody) {
    const { messages, temperature, max_tokens, top_p, top_k, tools, stream } = requestBody;

    // Convert messages to Gemini format
    const contents = messages.map(msg => {
      if (msg.role === 'system') {
        // Handle system messages - Gemini doesn't have system role, convert to user message
        return {
          role: 'user',
          parts: [{ text: `System: ${msg.content}` }]
        };
      }

      return {
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: Array.isArray(msg.content) 
          ? msg.content.map(part => {
              if (part.type === 'text') {
                return { text: part.text };
              } else if (part.type === 'image_url') {
                return {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: part.image_url.url.replace(/^data:image\/[^;]+;base64,/, '')
                  }
                };
              }
              return part;
            })
          : [{ text: msg.content }]
      };
    });

    const body = { contents };

    // Add generation config
    if (temperature !== undefined || max_tokens !== undefined || top_p !== undefined || top_k !== undefined) {
      body.generationConfig = {};
      if (temperature !== undefined) body.generationConfig.temperature = temperature;
      if (max_tokens !== undefined) body.generationConfig.maxOutputTokens = max_tokens;
      if (top_p !== undefined) body.generationConfig.topP = top_p;
      if (top_k !== undefined) body.generationConfig.topK = top_k;
    }

    // Add safety settings (permissive by default)
    body.safetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ];

    // Add tools if present
    if (tools && tools.length > 0) {
      body.tools = tools.map(tool => ({
        function_declarations: [{
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }]
      }));
    }

    return body;
  }

  /**
   * Transform request for Claude models on Vertex AI
   */
  transformClaudeRequest(requestBody) {
    // Claude on Vertex AI uses similar format to Anthropic API
    const { messages, temperature, max_tokens, top_p, tools } = requestBody;

    const body = {
      messages: messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content.map(part => part.text || part).join('')
      })),
      max_tokens: max_tokens || 4096,
      anthropic_version: "vertex-2023-10-16"
    };

    if (temperature !== undefined) body.temperature = temperature;
    if (top_p !== undefined) body.top_p = top_p;

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }


  /**
   * Transform Gemini response to OpenAI format
   */
  transformGeminiResponse(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('No candidates in Gemini response');
    }

    const content = candidate.content?.parts?.[0]?.text || '';
    const finishReason = this.mapFinishReason(candidate.finishReason);

    const response = {
      id: `vertex-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'vertex-ai',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content,
        },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata?.totalTokenCount || 0,
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Transform Claude response to OpenAI format
   */
  transformClaudeResponse(data) {
    const content = data.content?.[0]?.text || data.message || '';
    
    const response = {
      id: `vertex-claude-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'vertex-ai',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content,
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }


  /**
   * Handle streaming responses
   */
  transformStreamingResponse(response, request) {
    // For streaming, we need to parse SSE events and transform them
    const readable = new ReadableStream({
      start(controller) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  const transformed = this.transformStreamingChunk(data, request.vertexModelInfo);
                  if (transformed) {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(transformed)}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }

            return pump();
          });
        }

        return pump();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain',
        'Transfer-Encoding': 'chunked'
      }
    });
  }

  /**
   * Transform individual streaming chunks
   */
  transformStreamingChunk(data, modelInfo) {
    // Transform based on model type
    switch (modelInfo?.type) {
      case 'gemini':
        return this.transformGeminiStreamingChunk(data);
      case 'claude':
        return this.transformClaudeStreamingChunk(data);
      default:
        return this.transformGeminiStreamingChunk(data);
    }
  }

  /**
   * Transform Gemini streaming chunk
   */
  transformGeminiStreamingChunk(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) return null;

    const content = candidate.content?.parts?.[0]?.text || '';
    if (!content) return null;

    return {
      id: `vertex-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'vertex-ai',
      choices: [{
        index: 0,
        delta: {
          content: content
        },
        finish_reason: null
      }]
    };
  }

  /**
   * Transform Claude streaming chunk
   */
  transformClaudeStreamingChunk(data) {
    // Claude streaming transformation logic
    const content = data.delta?.text || data.content?.[0]?.text || '';
    if (!content) return null;

    return {
      id: `vertex-claude-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'vertex-ai',
      choices: [{
        index: 0,
        delta: {
          content: content
        },
        finish_reason: null
      }]
    };
  }

  /**
   * Map finish reasons to OpenAI format
   */
  mapFinishReason(finishReason) {
    const mapping = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop',
      'FINISH_REASON_UNSPECIFIED': 'stop'
    };
    return mapping[finishReason] || 'stop';
  }
}

module.exports = VertexAITransformer;