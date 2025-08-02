# Implementation Plan: Replace @musistudio/llms with OpenAI-Compatible API

## Overview
Replace the current rule-based routing system that uses `@musistudio/llms` with a direct integration to an OpenAI-compatible API that handles both model selection and request execution.

## Current Architecture Analysis

### Request Flow (Current)
```
ccr code → executeCodeCommand() → Claude CLI → Router Service → router() middleware → @musistudio/llms → Multiple LLM Providers
```

### Key Components to Replace
- **`@musistudio/llms`**: Complex LLM abstraction layer with provider support
- **Rule-based routing**: Token counting, model-specific routing logic
- **Provider/Transformer system**: Multiple provider configurations and transformations

## New Architecture Design

### Request Flow (New)
```
ccr code → executeCodeCommand() → Claude CLI → Router Service (Pure Fastify) → Your OpenAI API → Response
```

### Core Changes
1. **Remove**: `@musistudio/llms` dependency entirely
2. **Replace**: Complex routing with direct API forwarding
3. **Simplify**: Single API endpoint instead of multiple providers
4. **Maintain**: Claude CLI compatibility and authentication

## Implementation Steps

### Phase 1: Dependencies and Package Changes

#### 1.1 Update package.json
```json
{
  "dependencies": {
    "@fastify/static": "^8.2.0",
    // REMOVE: "@musistudio/llms": "^1.0.17",
    "dotenv": "^16.4.7",
    "json5": "^2.2.3",
    "openurl": "^1.1.1",
    "tiktoken": "^1.0.21", // Keep for token counting if needed
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.15",
    "esbuild": "^0.25.1",
    "fastify": "^5.4.0", // Move to dependencies
    "shx": "^0.4.0",
    "typescript": "^5.8.2"
  }
}
```

### Phase 2: Server Architecture Rewrite

#### 2.1 Rewrite src/server.ts
**Current**: Uses `Server` class from `@musistudio/llms`
**New**: Pure Fastify server with direct API endpoints

```typescript
// New server.ts structure
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

export const createServer = (config: any) => {
  const server = Fastify({ logger: true });
  
  // API endpoints for UI
  server.get('/api/config', async () => { /* config management */ });
  server.post('/api/config', async (req) => { /* config save */ });
  server.post('/api/restart', async (_, reply) => { /* restart */ });
  
  // Main Claude API endpoint
  server.post('/v1/messages', async (req, reply) => {
    // Forward to OpenAI-compatible API
  });
  
  // Static UI serving
  server.register(fastifyStatic, { /* ... */ });
  
  return server;
};
```

#### 2.2 Update src/index.ts
**Remove**: `@musistudio/llms` imports and initialization
**Replace**: Direct Fastify server management

```typescript
// Remove these imports:
// import { createServer } from "./server";
// import { router } from "./utils/router";

// New approach:
const server = createServer(config);
// Remove router hook - handle directly in /v1/messages endpoint
server.listen({ port: servicePort, host: HOST });
```

### Phase 3: API Integration Implementation

#### 3.1 Rewrite src/utils/router.ts
**Current**: Rule-based model selection that modifies `req.body.model`
**New**: HTTP client that forwards requests to OpenAI API

```typescript
// New router.ts structure
export const forwardToOpenAI = async (req: any, reply: any, config: any) => {
  try {
    // Transform Claude request to OpenAI format if needed
    const openAIRequest = transformClaudeToOpenAI(req.body);
    
    // Call your OpenAI-compatible API
    const response = await fetch(config.AutoRouter.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.AutoRouter.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openAIRequest)
    });
    
    const result = await response.json();
    
    // Transform OpenAI response to Claude format if needed
    const claudeResponse = transformOpenAIToClaude(result);
    
    reply.send(claudeResponse);
  } catch (error) {
    // Fallback logic or error handling
  }
};
```

#### 3.2 Request/Response Format Handling
- **Input**: Claude `/v1/messages` format
- **Output**: OpenAI `/v1/chat/completions` format
- **Response**: Transform back to Claude format

### Phase 4: Configuration Updates

#### 4.1 Update config.example.json
```json
{
  "AutoRouter": {
    "enabled": true,
    "endpoint": "https://your-api.com/v1/chat/completions",
    "api_key": "your-api-key",
    "timeout": 30000
  },
  "APIKEY": "your-secret-key",
  "HOST": "0.0.0.0",
  "PORT": 3456,
  "API_TIMEOUT_MS": 600000,
  
  // Optional: Keep for fallback
  "Fallback": {
    "enabled": false,
    "Providers": [ /* legacy config */ ],
    "Router": { /* legacy routing */ }
  }
}
```

#### 4.2 Update src/utils/index.ts
- Add validation for `AutoRouter` configuration
- Update interactive setup to ask for OpenAI API details
- Handle configuration migration from old format

### Phase 5: Error Handling and Fallback

#### 5.1 Fallback Strategy
```typescript
// Fallback options when OpenAI API fails:
1. Return error to Claude CLI (fail fast)
2. Use legacy routing system (if configured)
3. Use default model/provider (emergency fallback)
```

#### 5.2 Logging and Monitoring
- Log API calls and response times
- Track model selection decisions
- Monitor fallback usage

### Phase 6: Authentication and Security

#### 6.1 Maintain Claude CLI Authentication
- Keep existing `apiKeyAuth` middleware
- Handle both Claude CLI auth and OpenAI API auth
- Secure API key storage

#### 6.2 Request Validation
- Validate incoming Claude requests
- Sanitize data before forwarding to OpenAI API
- Handle malformed requests gracefully

## Files to Modify

### Core Files (Major Changes)
- `package.json` - Remove @musistudio/llms, move fastify to dependencies
- `src/server.ts` - Complete rewrite with pure Fastify
- `src/index.ts` - Remove llms initialization, direct server management
- `src/utils/router.ts` - Replace with OpenAI API client
- `config.example.json` - New configuration schema

### Supporting Files (Minor Changes)
- `src/utils/index.ts` - Configuration validation updates
- `src/middleware/auth.ts` - Potentially update for new endpoints
- `scripts/build.js` - May need updates for new dependencies

### Files to Keep Unchanged
- `src/cli.ts` - CLI interface remains the same
- `src/utils/codeCommand.ts` - Claude CLI execution unchanged
- `src/utils/processCheck.ts` - Process management unchanged
- `src/constants.ts` - File paths and constants unchanged

## Testing Strategy

### Phase 1: Basic Functionality
1. Remove @musistudio/llms and verify build works
2. Test pure Fastify server starts and serves UI
3. Test `/v1/messages` endpoint responds

### Phase 2: API Integration
1. Test request forwarding to OpenAI API
2. Verify response format compatibility with Claude CLI
3. Test authentication and error handling

### Phase 3: End-to-End Testing
1. Test complete flow: `ccr code "Hello world"` → API → Response
2. Test UI functionality for configuration
3. Test service start/stop/restart commands

### Phase 4: Edge Cases
1. Test API timeouts and failures
2. Test malformed requests
3. Test large requests (token limits)

## Migration Guide for Users

### Configuration Migration
```bash
# Backup existing config
cp ~/.claude-code-router/config.json ~/.claude-code-router/config.json.backup

# Update to new format
ccr ui  # Use web interface to configure AutoRouter
```

### Breaking Changes
- Old `Providers` and `Router` configuration sections are deprecated
- New `AutoRouter` section is required
- API behavior changes from multi-provider to single OpenAI-compatible API

## Success Criteria

### Functional Requirements
- [ ] Claude CLI commands work unchanged: `ccr code "prompt"`
- [ ] Web UI remains functional for configuration
- [ ] Service management commands work: start/stop/status/restart
- [ ] Authentication and security maintained

### Performance Requirements
- [ ] API response time ≤ current implementation
- [ ] Memory usage reduced (no complex LLM abstractions)
- [ ] Startup time improved (simpler dependencies)

### Quality Requirements
- [ ] Error handling graceful and informative
- [ ] Logging provides debugging information
- [ ] Configuration validation prevents misconfigurations
- [ ] Backward compatibility for existing users (with migration path)

## Risk Mitigation

### High Risk: Breaking Existing Users
- **Mitigation**: Provide clear migration guide and configuration conversion
- **Fallback**: Keep old config format support during transition

### Medium Risk: API Compatibility Issues
- **Mitigation**: Thorough testing of request/response transformations
- **Fallback**: Detailed error messages for debugging

### Low Risk: Performance Regression
- **Mitigation**: Benchmark before/after performance
- **Fallback**: Optimize HTTP client and request handling

## Timeline Estimate
- **Phase 1-2**: 2-3 hours (dependency changes and server rewrite)
- **Phase 3**: 2-3 hours (API integration and testing)
- **Phase 4-6**: 1-2 hours (configuration, auth, final testing)
- **Total**: 5-8 hours for complete implementation