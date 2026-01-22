---
sidebar_position: 5
---

# DeepSeek Transformer

The DeepSeek transformer handles specifics of the DeepSeek API, including cache metadata and reasoning content.

## Why Cache Metadata Matters

Cache statistics enable:
- **Cost optimization**: Identify frequently used prompts to maximize caching
- **Performance monitoring**: Track cache hit rates across requests
- **Debugging**: Understand which parts of prompts are cached vs. recomputed

**Example savings**: A 90% cache hit rate can reduce API costs by up to 90% for repeated queries.

## Cache Metadata Preservation

DeepSeek API returns cache metadata in the response, which is crucial for cost optimization. The transformer chain ensures this metadata is preserved and mapped to the Anthropic format.

### Key Fields

- `prompt_cache_hit_tokens`: Number of tokens served from cache
- `prompt_cache_miss_tokens`: Number of tokens not served from cache
- `prompt_tokens_details`: Detailed token usage (including `cached_tokens`)

### How it Works

1. **DeepSeek API Response**: Returns OpenAI-compatible format with `prompt_cache_hit_tokens`
2. **`deepseek` transformer**: Handles `reasoning_content` → `thinking` transformation, enforces token limits
3. **`anthropic` transformer**: Converts OpenAI format to Anthropic format and maps cache fields

### Example Response

**Without `anthropic` transformer:**
```json
{
  "usage": {
    "input_tokens": 355,
    "output_tokens": 50,
    "cache_read_input_tokens": 0  // ❌ Cache data lost
  }
}
```
**With proper transformer chain:**

```json
{
  "usage": {
    "input_tokens": 355,
    "output_tokens": 50,
    "cache_read_input_tokens": 320  // ✅ Shows 90% cache hit!
  }
}
```

### Implementation
#### `anthropic` Transformer Logic
The `anthropic` transformer includes a helper method `getCachedTokens()` to handle multiple cache-related fields:

```typescript
private getCachedTokens(usage: any): number {
  // Try prompt_tokens_details?.cached_tokens first, then prompt_cache_hit_tokens
  return usage?.prompt_tokens_details?.cached_tokens ||
         usage?.prompt_cache_hit_tokens ||
         0;
}
```
This ensures that `cache_read_input_tokens` is correctly populated from either:

- `prompt_tokens_details.cached_tokens` (OpenAI standard)
- `prompt_cache_hit_tokens` (DeepSeek-specific)

### Configuration
#### Basic Configuration
To enable cache metadata preservation, the transformer chain must include both `deepseek` and `anthropic`:

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "${DEEPSEEK_API_KEY}",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek", "anthropic"]
      }
    }
  ]
}
```
#### Model-Specific Configuration
For `deepseek-chat` with tool support:

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "transformer": {
        "use": ["deepseek", "anthropic"],
        "deepseek-chat": {
          "use": ["deepseek", "anthropic", "tooluse"]
        }
      }
    }
  ]
}
```
**Note**: Model-specific `use` arrays replace (not append to) the parent configuration. Always include all required transformers in model-specific configs.

## Verified Performance
Test results with identical 355-token system prompts:

- **Request 1 (cold)**: `cache_read_input_tokens: 0`
- **Request 2 (warm)**: `cache_read_input_tokens: 320` (90.1% cache hit)

**Cost impact**: ~90% reduction in prompt processing costs for repeated queries.

## Testing Cache Preservation

Verify cache metadata is working correctly by sending two requests with identical system prompts.

### Test Procedure

1. **Send first request** with a large system prompt (>1024 tokens)
2. **Wait 2-3 seconds** for cache to populate
3. **Send second request** with same system prompt, different user question
4. **Verify** `cache_read_input_tokens > 0` in second response

### Example with curl

```bash
# Define large system prompt
SYSTEM_PROMPT="You are an expert analyst... [repeat 200+ times for >1024 tokens]"

# Request 1 (cache miss)
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${ANTHROPIC_AUTH_TOKEN}" \
  -d "{
    \"model\": \"claude-3-5-sonnet-20241022\",
    \"messages\": [
      {\"role\": \"system\", \"content\": \"${SYSTEM_PROMPT}\"},
      {\"role\": \"user\", \"content\": \"What is X?\"}
    ],
    \"max_tokens\": 50
  }" | jq '.usage'

# Output: {"input_tokens": 355, "cache_read_input_tokens": 0, ...}

# Wait for cache
sleep 3

# Request 2 (cache hit expected)
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${ANTHROPIC_AUTH_TOKEN}" \
  -d "{
    \"model\": \"claude-3-5-sonnet-20241022\",
    \"messages\": [
      {\"role\": \"system\", \"content\": \"${SYSTEM_PROMPT}\"},
      {\"role\": \"user\", \"content\": \"What is Y?\"}
    ],
    \"max_tokens\": 50
  }" | jq '.usage'

# Output: {"input_tokens": 355, "cache_read_input_tokens": 320, ...}
#         ✅ Cache hit! 90%+ tokens served from cache
```
### Success Indicators
- ✅ Second request shows `cache_read_input_tokens > 0`
- ✅ Cache hit percentage: (`cache_read_input_tokens` / `input_tokens`) * 100
- ✅ Typical cache hit rates: 80-95% for identical system prompts

## Troubleshooting
### No cache hits?

- **Check transformer chain** includes `"anthropic"`
- **Verify system prompt** >1024 tokens (DeepSeek requirement)
- **Ensure requests** sent within cache TTL (~5 minutes)
- **Check CCR logs** for transformer errors
