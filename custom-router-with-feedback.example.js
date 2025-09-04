// Example custom router file, demonstrating how to use the new request result feedback mechanism

// Store provider status
const providerStatus = new Map();

// Model selection function
async function selectModel(req, config) {
  console.log('[Custom Router] Selecting model');
  
  // Check provider status to avoid rate-limited providers
  for (const [providerName, status] of providerStatus.entries()) {
    if (status.rateLimited && Date.now() < status.rateLimitEnd) {
      console.log(`[Custom Router] Skipping rate-limited provider: ${providerName}`);
    }
  }
  
  // Simple load balancing logic
  const providers = ['modelscope', 'iflow'];
  const availableProviders = providers.filter(p => {
    const status = providerStatus.get(p);
    return !status || !status.rateLimited || Date.now() >= status.rateLimitEnd;
  });
  
  if (availableProviders.length === 0) {
    // If all providers are rate-limited, fall back to default
    return config.Router.default;
  }
  
  // Select the first available provider
  const selectedProvider = availableProviders[0];
  const providerConfig = config.Providers.find(p => p.name === selectedProvider);
  
  if (providerConfig && providerConfig.modelTypes) {
    // Select model based on request type
    let modelType = 'default';
    if (req.body.thinking) {
      modelType = 'thinking';
    } else if (req.body.model?.startsWith('claude-3-5-haiku')) {
      modelType = 'background';
    }
    
    const modelName = providerConfig.modelTypes[modelType] || providerConfig.modelTypes.default;
    if (modelName) {
      return `${selectedProvider},${modelName}`;
    }
  }
  
  return config.Router.default;
}

// Request result handling function
async function handleResult(req, config, result) {
  console.log('[Custom Router] Handling request result', result);
  
  // Update provider status based on request outcome
  if (!result.success) {
    // Check for 429 rate limit errors
    const isRateLimitError = result.error && (
      result.status === 429 || 
      (result.error.statusCode === 429) ||
      (result.error.message && (
        result.error.message.includes('429') || 
        result.error.message.includes('rate limit') ||
        result.error.message.includes('too many requests')
      ))
    );
    
    if (isRateLimitError) {
      console.log(`[Custom Router] Detected 429 error for ${result.provider}`);
      
      // Apply exponential backoff
      const currentStatus = providerStatus.get(result.provider) || { errorCount: 0 };
      const errorCount = (currentStatus.errorCount || 0) + 1;
      const backoffTime = Math.min(300000 * Math.pow(2, errorCount), 3600000); // Max 1 hour
      
      providerStatus.set(result.provider, {
        rateLimited: true,
        rateLimitEnd: Date.now() + backoffTime,
        errorCount: errorCount
      });
      
      console.log(`[Custom Router] Applied backoff for ${result.provider}: ${backoffTime}ms`);
    } else {
      // Handle other errors
      const currentStatus = providerStatus.get(result.provider) || { errorCount: 0 };
      providerStatus.set(result.provider, {
        ...currentStatus,
        errorCount: (currentStatus.errorCount || 0) + 1,
        lastError: Date.now()
      });
    }
  } else {
    // Request succeeded, reduce error count
    const currentStatus = providerStatus.get(result.provider);
    if (currentStatus) {
      const newErrorCount = Math.max(0, (currentStatus.errorCount || 0) - 1);
      providerStatus.set(result.provider, {
        ...currentStatus,
        errorCount: newErrorCount
      });
    }
  }
}

// Export the enhanced API
module.exports = {
  selectModel,
  handleResult
};

// Backward compatibility: if users call the function directly instead of using the object API
module.exports.selectModel = selectModel;
module.exports.handleResult = handleResult;