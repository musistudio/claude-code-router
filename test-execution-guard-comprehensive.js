#!/usr/bin/env tsx

/**
 * COMPREHENSIVE ExecutionGuard Test Suite
 * 
 * Testează toate componentele principal:
 * 1. Deduplication System 
 * 2. Rate Limiting (multi-tier)
 * 3. Circuit Breaker
 * 4. Queue Management
 * 5. Retry Logic with Exponential Backoff
 * 6. Provider Fallback
 * 7. Performance & Memory Testing
 */

const { ExecutionGuard, guardedExecute, canMakeRequest } = require('./src/utils/ExecutionGuard');

// Test Results Storage
const testResults = {
  deduplication: { passed: 0, failed: 0, issues: [] },
  rateLimiting: { passed: 0, failed: 0, issues: [] },
  circuitBreaker: { passed: 0, failed: 0, issues: [] },
  queueManagement: { passed: 0, failed: 0, issues: [] },
  retryLogic: { passed: 0, failed: 0, issues: [] },
  providerFallback: { passed: 0, failed: 0, issues: [] },
  performance: { passed: 0, failed: 0, issues: [], metrics: {} },
  integration: { passed: 0, failed: 0, issues: [] }
};

// Helper function to track test results
function trackTest(category, passed, description, issue = null) {
  if (passed) {
    testResults[category].passed++;
    console.log(`✅ ${description}`);
  } else {
    testResults[category].failed++;
    testResults[category].issues.push(issue || description);
    console.log(`❌ ${description}`);
    if (issue) console.log(`   Issue: ${issue}`);
  }
}

// Mock request generator
function createMockRequest(id, body = {}) {
  return {
    url: `/api/test/${id}`,
    method: 'POST',
    body: { id, ...body, timestamp: Date.now() },
    sessionId: 'test-session-' + Math.random().toString(36).substring(7),
    headers: { 'user-agent': 'ExecutionGuard-Test/1.0' }
  };
}

// Mock API call
function mockApiCall(id, shouldFail = false, delay = 100, errorStatus = 500) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        const error = new Error(`API Error for ${id}`);
        error.status = errorStatus;
        error.response = { status: errorStatus };
        reject(error);
      } else {
        resolve({ 
          id, 
          data: `Response for ${id}`, 
          timestamp: Date.now(),
          processingTime: delay 
        });
      }
    }, delay);
  });
}

// Create multiple test instances
const configurations = {
  permissive: {
    deduplication: { enabled: true, ttlSeconds: 5, maxCacheSize: 100, excludeEndpoints: [] },
    rateLimiting: {
      enabled: true,
      rules: {
        perMinute: { requests: 100, windowMs: 60000 },
        perHour: { requests: 1000, windowMs: 3600000 },
        perDay: { requests: 10000, windowMs: 86400000 },
        burst: { requests: 20, windowMs: 5000 }
      }
    },
    circuitBreaker: { enabled: true, failureThreshold: 10, recoveryTimeMs: 5000 },
    queue: { enabled: true, minDelayMs: 50, maxQueueSize: 50 },
    retry: { 
      enabled: true, maxRetries: 3, initialBackoffMs: 100, maxBackoffMs: 1000,
      jitterMs: 50, retryableStatusCodes: [429, 500, 502, 503, 504] 
    },
    fallback: { enabled: true, recoveryWindowMs: 30000 },
    persistence: { enabled: false }
  },
  
  strict: {
    deduplication: { enabled: true, ttlSeconds: 2, maxCacheSize: 10, excludeEndpoints: [] },
    rateLimiting: {
      enabled: true,
      rules: {
        perMinute: { requests: 5, windowMs: 60000 },
        perHour: { requests: 20, windowMs: 3600000 },
        perDay: { requests: 100, windowMs: 86400000 },
        burst: { requests: 2, windowMs: 1000 }
      }
    },
    circuitBreaker: { enabled: true, failureThreshold: 2, recoveryTimeMs: 2000 },
    queue: { enabled: true, minDelayMs: 500, maxQueueSize: 5 },
    retry: { 
      enabled: true, maxRetries: 1, initialBackoffMs: 500, maxBackoffMs: 1000,
      jitterMs: 100, retryableStatusCodes: [429, 500] 
    },
    fallback: { enabled: true, recoveryWindowMs: 10000 },
    persistence: { enabled: false }
  },
  
  disabled: {
    deduplication: { enabled: false, ttlSeconds: 1, maxCacheSize: 1, excludeEndpoints: [] },
    rateLimiting: { enabled: false, rules: {} },
    circuitBreaker: { enabled: false, failureThreshold: 1, recoveryTimeMs: 1000 },
    queue: { enabled: false, minDelayMs: 0, maxQueueSize: 1 },
    retry: { enabled: false, maxRetries: 0, initialBackoffMs: 0, maxBackoffMs: 0, jitterMs: 0, retryableStatusCodes: [] },
    fallback: { enabled: false, recoveryWindowMs: 1000 },
    persistence: { enabled: false }
  }
};

const guards = {
  permissive: new ExecutionGuard(configurations.permissive),
  strict: new ExecutionGuard(configurations.strict),
  disabled: new ExecutionGuard(configurations.disabled)
};

// ========================================================================================
// TEST 1: DEDUPLICATION SYSTEM
// ========================================================================================
async function testDeduplicationSystem() {
  console.log('\n🔍 === TEST 1: DEDUPLICATION SYSTEM ===');
  
  // Test 1.1: Basic deduplication
  const req1 = createMockRequest('dup-test-1', { data: 'identical' });
  
  const start1 = Date.now();
  const result1 = await guards.permissive.execute(
    () => mockApiCall('dup-test-1', false, 300),
    { req: req1, skipQueue: true }
  );
  const time1 = Date.now() - start1;
  
  // Same request - should be cached
  const start2 = Date.now();
  const result2 = await guards.permissive.execute(
    () => mockApiCall('dup-test-1-different', false, 300),
    { req: req1, skipQueue: true }
  );
  const time2 = Date.now() - start2;
  
  trackTest('deduplication', 
    time2 < 50 && JSON.stringify(result1.id) === JSON.stringify(result2.id),
    `Deduplication basic functionality (${time1}ms vs ${time2}ms)`,
    time2 >= 50 ? `Cache miss - second request took ${time2}ms` : null
  );
  
  // Test 1.2: Cache size limits
  for (let i = 0; i < 15; i++) {
    await guards.permissive.execute(
      () => mockApiCall(`cache-fill-${i}`, false, 10),
      { req: createMockRequest(`cache-fill-${i}`), skipQueue: true }
    );
  }
  
  const stats = guards.permissive.getStats();
  trackTest('deduplication',
    stats.deduplication.totalCachedRequests <= 100, // maxCacheSize
    `Cache size limit respected (${stats.deduplication.totalCachedRequests} entries)`,
    stats.deduplication.totalCachedRequests > 100 ? 'Cache size exceeded limit' : null
  );
  
  // Test 1.3: Exclude endpoints
  const excludedReq = createMockRequest('excluded', {});
  excludedReq.url = '/api/analytics/test';
  
  const excluded1 = await guards.permissive.execute(
    () => mockApiCall('excluded-1', false, 100),
    { req: excludedReq, skipQueue: true }
  );
  
  const excluded2 = await guards.permissive.execute(
    () => mockApiCall('excluded-2', false, 100),
    { req: excludedReq, skipQueue: true }
  );
  
  trackTest('deduplication',
    excluded1.id !== excluded2.id,
    'Exclude endpoints functionality',
    excluded1.id === excluded2.id ? 'Excluded endpoint was still cached' : null
  );
  
  // Test 1.4: TTL expiration
  const shortTtlReq = createMockRequest('ttl-test');
  await guards.strict.execute(() => mockApiCall('ttl-1', false, 50), { req: shortTtlReq, skipQueue: true });
  
  // Wait for TTL to expire (2s for strict config)
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  const beforeTtl = Date.now();
  await guards.strict.execute(() => mockApiCall('ttl-2', false, 100), { req: shortTtlReq, skipQueue: true });
  const ttlTime = Date.now() - beforeTtl;
  
  trackTest('deduplication',
    ttlTime >= 90,
    `TTL expiration (${ttlTime}ms - should be ~100ms for fresh call)`,
    ttlTime < 90 ? 'Cache did not expire as expected' : null
  );
}

// ========================================================================================
// TEST 2: RATE LIMITING SYSTEM
// ========================================================================================
async function testRateLimitingSystem() {
  console.log('\n⚡ === TEST 2: RATE LIMITING SYSTEM ===');
  
  // Test 2.1: Burst protection
  try {
    const burstPromises = [];
    for (let i = 0; i < 5; i++) {
      burstPromises.push(
        guards.strict.execute(
          () => mockApiCall(`burst-${i}`, false, 10),
          { req: createMockRequest(`burst-${i}`), skipDeduplication: true, skipQueue: true }
        )
      );
    }
    
    await Promise.all(burstPromises);
    trackTest('rateLimiting', false, 'Burst protection', 'Burst limit was not enforced');
  } catch (error) {
    trackTest('rateLimiting', 
      error.message.includes('Rate limit exceeded'),
      'Burst protection triggered',
      !error.message.includes('Rate limit exceeded') ? `Unexpected error: ${error.message}` : null
    );
  }
  
  // Test 2.2: Per-minute limits (wait for burst to reset)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  let successCount = 0;
  for (let i = 0; i < 8; i++) {
    try {
      await guards.strict.execute(
        () => mockApiCall(`minute-${i}`, false, 10),
        { req: createMockRequest(`minute-${i}`), skipDeduplication: true, skipQueue: true }
      );
      successCount++;
    } catch (error) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  trackTest('rateLimiting',
    successCount <= 5,
    `Per-minute limit enforcement (${successCount}/8 requests succeeded)`,
    successCount > 5 ? 'Per-minute limit was not enforced' : null
  );
  
  // Test 2.3: Different session IDs
  try {
    const sessionPromises = [];
    for (let i = 0; i < 3; i++) {
      const sessionReq = createMockRequest(`session-${i}`);
      sessionReq.sessionId = `different-session-${i}`;
      sessionPromises.push(
        guards.permissive.execute(
          () => mockApiCall(`session-${i}`, false, 50),
          { req: sessionReq, skipDeduplication: true, skipQueue: true }
        )
      );
    }
    
    await Promise.all(sessionPromises);
    trackTest('rateLimiting', true, 'Different sessions handled correctly');
  } catch (error) {
    trackTest('rateLimiting', false, 'Different sessions handling', error.message);
  }
  
  // Test 2.4: Rate limiting disabled
  try {
    const disabledPromises = [];
    for (let i = 0; i < 10; i++) {
      disabledPromises.push(
        guards.disabled.execute(
          () => mockApiCall(`disabled-${i}`, false, 10),
          { req: createMockRequest(`disabled-${i}`), skipDeduplication: true, skipQueue: true }
        )
      );
    }
    
    await Promise.all(disabledPromises);
    trackTest('rateLimiting', true, 'Rate limiting can be disabled');
  } catch (error) {
    trackTest('rateLimiting', false, 'Rate limiting disabled', 'Limits were still enforced when disabled');
  }
}

// ======================================================================================== 
// TEST 3: CIRCUIT BREAKER
// ========================================================================================
async function testCircuitBreakerSystem() {
  console.log('\n⚡ === TEST 3: CIRCUIT BREAKER SYSTEM ===');
  
  // Clear any existing state
  guards.permissive.resetCircuitBreaker();
  
  // Test 3.1: Circuit breaker opening
  let failureCount = 0;
  for (let i = 0; i < 12; i++) {
    try {
      await guards.permissive.execute(
        () => mockApiCall(`cb-fail-${i}`, true, 50, 500),
        { req: createMockRequest(`cb-fail-${i}`), skipDeduplication: true, skipQueue: true }
      );
    } catch (error) {
      failureCount++;
      if (error.message.includes('Circuit breaker is OPEN')) {
        break;
      }
    }
  }
  
  trackTest('circuitBreaker',
    failureCount >= 10, // Should trigger at threshold
    `Circuit breaker opened after ${failureCount} failures`,
    failureCount < 10 ? 'Circuit breaker did not open at expected threshold' : null
  );
  
  // Test 3.2: Circuit breaker blocking requests
  try {
    await guards.permissive.execute(
      () => mockApiCall('cb-blocked', false, 50),
      { req: createMockRequest('cb-blocked'), skipDeduplication: true, skipQueue: true }
    );
    trackTest('circuitBreaker', false, 'Circuit breaker blocking', 'Request was not blocked by open circuit breaker');
  } catch (error) {
    trackTest('circuitBreaker',
      error.message.includes('Circuit breaker is OPEN'),
      'Circuit breaker blocking requests',
      !error.message.includes('Circuit breaker is OPEN') ? `Unexpected error: ${error.message}` : null
    );
  }
  
  // Test 3.3: Circuit breaker recovery
  console.log('   Waiting for circuit breaker recovery...');
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait for recovery
  
  try {
    await guards.permissive.execute(
      () => mockApiCall('cb-recovery', false, 50),
      { req: createMockRequest('cb-recovery'), skipDeduplication: true, skipQueue: true }
    );
    trackTest('circuitBreaker', true, 'Circuit breaker recovery');
  } catch (error) {
    trackTest('circuitBreaker', false, 'Circuit breaker recovery', error.message);
  }
  
  // Test 3.4: Manual reset
  guards.permissive.resetCircuitBreaker();
  const stats = guards.permissive.getStats();
  trackTest('circuitBreaker',
    stats.rateLimiting.circuitBreakerState === 'CLOSED',
    'Manual circuit breaker reset',
    stats.rateLimiting.circuitBreakerState !== 'CLOSED' ? 'Circuit breaker state not reset correctly' : null
  );
}

// ========================================================================================
// TEST 4: QUEUE MANAGEMENT 
// ========================================================================================
async function testQueueManagement() {
  console.log('\n📋 === TEST 4: QUEUE MANAGEMENT ===');
  
  // Test 4.1: Sequential processing with delays
  const startTime = Date.now();
  const queuePromises = [];
  
  for (let i = 0; i < 5; i++) {
    queuePromises.push(
      guards.permissive.execute(
        () => mockApiCall(`queue-${i}`, false, 50),
        { req: createMockRequest(`queue-${i}`), skipDeduplication: true }
      ).then(result => ({
        ...result,
        queuedAt: Date.now() - startTime
      }))
    );
  }
  
  const queueResults = await Promise.all(queuePromises);
  
  // Check that requests were processed with proper delays
  const intervals = [];
  for (let i = 1; i < queueResults.length; i++) {
    intervals.push(queueResults[i].queuedAt - queueResults[i-1].queuedAt);
  }
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  trackTest('queueManagement',
    avgInterval >= 40, // Should be around minDelayMs (50ms) - processing time
    `Sequential processing with delays (avg: ${avgInterval.toFixed(1)}ms)`,
    avgInterval < 40 ? 'Queue delays not properly enforced' : null
  );
  
  // Test 4.2: Queue size limits
  try {
    const overflowPromises = [];
    for (let i = 0; i < 7; i++) { // Exceed maxQueueSize of 5 for strict config
      overflowPromises.push(
        guards.strict.execute(
          () => mockApiCall(`overflow-${i}`, false, 200),
          { req: createMockRequest(`overflow-${i}`), skipDeduplication: true }
        )
      );
    }
    
    await Promise.all(overflowPromises);
    trackTest('queueManagement', false, 'Queue size limit', 'Queue size limit was not enforced');
  } catch (error) {
    trackTest('queueManagement',
      error.message.includes('Queue full'),
      'Queue size limit enforcement',
      !error.message.includes('Queue full') ? `Unexpected error: ${error.message}` : null
    );
  }
  
  // Test 4.3: Queue disabled
  const disabledStart = Date.now();
  const disabledPromises = [];
  
  for (let i = 0; i < 3; i++) {
    disabledPromises.push(
      guards.disabled.execute(
        () => mockApiCall(`no-queue-${i}`, false, 50),
        { req: createMockRequest(`no-queue-${i}`), skipDeduplication: true }
      )
    );
  }
  
  await Promise.all(disabledPromises);
  const disabledTime = Date.now() - disabledStart;
  
  trackTest('queueManagement',
    disabledTime < 200, // Should be parallel, not sequential
    `Queue disabled - parallel execution (${disabledTime}ms)`,
    disabledTime >= 200 ? 'Requests were still queued when queue disabled' : null
  );
}

// ========================================================================================
// TEST 5: RETRY LOGIC
// ========================================================================================
async function testRetryLogic() {
  console.log('\n🔄 === TEST 5: RETRY LOGIC ===');
  
  // Test 5.1: Successful retry after failures
  let attemptCount = 0;
  const retryFn = () => {
    attemptCount++;
    if (attemptCount < 3) {
      const error = new Error('Temporary failure');
      error.status = 503; // Retryable error
      throw error;
    }
    return { success: true, attempts: attemptCount };
  };
  
  try {
    const retryResult = await guards.permissive.execute(
      retryFn,
      { req: createMockRequest('retry-success'), skipDeduplication: true, skipQueue: true }
    );
    
    trackTest('retryLogic',
      retryResult.attempts === 3,
      `Successful retry after failures (${retryResult.attempts} attempts)`,
      retryResult.attempts !== 3 ? 'Incorrect number of retry attempts' : null
    );
  } catch (error) {
    trackTest('retryLogic', false, 'Successful retry', error.message);
  }
  
  // Test 5.2: Non-retryable errors
  try {
    await guards.permissive.execute(
      () => mockApiCall('non-retryable', true, 50, 400), // 400 is not retryable
      { req: createMockRequest('non-retryable'), skipDeduplication: true, skipQueue: true }
    );
    trackTest('retryLogic', false, 'Non-retryable error handling', 'Non-retryable error was retried');
  } catch (error) {
    trackTest('retryLogic',
      error.status === 400,
      'Non-retryable error not retried',
      error.status !== 400 ? 'Error status changed during processing' : null
    );
  }
  
  // Test 5.3: Max retries exceeded
  let maxRetryAttempts = 0;
  try {
    await guards.strict.execute(
      () => {
        maxRetryAttempts++;
        const error = new Error('Always fails');
        error.status = 500; // Retryable
        throw error;
      },
      { req: createMockRequest('max-retries'), skipDeduplication: true, skipQueue: true }
    );
    trackTest('retryLogic', false, 'Max retries limit', 'Request succeeded when it should have failed');
  } catch (error) {
    trackTest('retryLogic',
      maxRetryAttempts === 2, // maxRetries: 1 + initial attempt = 2 total
      `Max retries respected (${maxRetryAttempts} attempts)`,
      maxRetryAttempts !== 2 ? `Wrong number of attempts: ${maxRetryAttempts}` : null
    );
  }
  
  // Test 5.4: Exponential backoff timing
  const backoffTimes = [];
  let backoffAttempts = 0;
  
  try {
    await guards.permissive.execute(
      () => {
        const startTime = Date.now();
        backoffAttempts++;
        if (backoffTimes.length > 0) {
          backoffTimes.push(startTime - backoffTimes[backoffTimes.length - 1]);
        } else {
          backoffTimes.push(startTime);
        }
        
        if (backoffAttempts <= 3) {
          const error = new Error('Backoff test');
          error.status = 503;
          throw error;
        }
        return { success: true };
      },
      { req: createMockRequest('backoff'), skipDeduplication: true, skipQueue: true }
    );
    
    if (backoffTimes.length > 2) {
      const increasing = backoffTimes[2] > backoffTimes[1];
      trackTest('retryLogic',
        increasing,
        `Exponential backoff timing (${backoffTimes[1]}ms -> ${backoffTimes[2]}ms)`,
        !increasing ? 'Backoff times did not increase exponentially' : null
      );
    } else {
      trackTest('retryLogic', false, 'Exponential backoff timing', 'Not enough attempts recorded');
    }
  } catch (error) {
    trackTest('retryLogic', false, 'Exponential backoff test', error.message);
  }
}

// ========================================================================================
// TEST 6: PROVIDER FALLBACK
// ========================================================================================
async function testProviderFallback() {
  console.log('\n🔄 === TEST 6: PROVIDER FALLBACK ===');
  
  // Test 6.1: Provider failure recording
  try {
    await guards.permissive.execute(
      () => mockApiCall('provider-fail', true, 50, 500),
      { req: createMockRequest('provider-fail'), providerName: 'test-provider', skipDeduplication: true, skipQueue: true }
    );
  } catch (error) {
    // Expected to fail
  }
  
  const isInRecovery = guards.permissive.isProviderInRecovery('test-provider');
  trackTest('providerFallback',
    isInRecovery,
    'Provider failure recorded',
    !isInRecovery ? 'Provider failure not recorded correctly' : null
  );
  
  // Test 6.2: Provider success clears failure
  try {
    await guards.permissive.execute(
      () => mockApiCall('provider-success', false, 50),
      { req: createMockRequest('provider-success'), providerName: 'test-provider', skipDeduplication: true, skipQueue: true }
    );
    
    // After successful request, provider should not be in recovery
    setTimeout(() => {
      const stillInRecovery = guards.permissive.isProviderInRecovery('test-provider');
      trackTest('providerFallback',
        !stillInRecovery,
        'Provider success clears failure status',
        stillInRecovery ? 'Provider still marked as in recovery after success' : null
      );
    }, 100);
  } catch (error) {
    trackTest('providerFallback', false, 'Provider success handling', error.message);
  }
  
  // Test 6.3: Multiple provider tracking
  const providers = ['provider-a', 'provider-b', 'provider-c'];
  
  for (const provider of providers) {
    try {
      await guards.permissive.execute(
        () => mockApiCall(`${provider}-test`, false, 30),
        { req: createMockRequest(`${provider}-test`), providerName: provider, skipDeduplication: true, skipQueue: true }
      );
    } catch (error) {
      // Some may fail, that's okay
    }
  }
  
  const stats = guards.permissive.getStats();
  const trackedProviders = Object.keys(stats.providers).length;
  
  trackTest('providerFallback',
    trackedProviders >= 3,
    `Multiple provider tracking (${trackedProviders} providers tracked)`,
    trackedProviders < 3 ? 'Not all providers were tracked' : null
  );
  
  // Wait for provider recovery windows to be tested
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// ========================================================================================
// TEST 7: PERFORMANCE & MEMORY
// ========================================================================================
async function testPerformanceAndMemory() {
  console.log('\n🚀 === TEST 7: PERFORMANCE & MEMORY ===');
  
  // Test 7.1: Memory usage under load
  const initialMemory = process.memoryUsage().heapUsed;
  
  const loadPromises = [];
  for (let i = 0; i < 100; i++) {
    loadPromises.push(
      guards.permissive.execute(
        () => mockApiCall(`load-${i}`, false, 10),
        { req: createMockRequest(`load-${i}`) }
      )
    );
  }
  
  const loadStartTime = Date.now();
  await Promise.all(loadPromises);
  const loadEndTime = Date.now();
  const finalMemory = process.memoryUsage().heapUsed;
  
  const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
  const avgResponseTime = (loadEndTime - loadStartTime) / 100;
  
  testResults.performance.metrics.memoryUsage = memoryIncrease;
  testResults.performance.metrics.averageResponseTime = avgResponseTime;
  testResults.performance.metrics.throughput = 100 / ((loadEndTime - loadStartTime) / 1000);
  
  trackTest('performance',
    memoryIncrease < 50, // Less than 50MB increase
    `Memory usage under load (+${memoryIncrease.toFixed(2)}MB)`,
    memoryIncrease >= 50 ? `High memory usage: ${memoryIncrease.toFixed(2)}MB` : null
  );
  
  trackTest('performance',
    avgResponseTime < 200, // Average response under 200ms
    `Average response time (${avgResponseTime.toFixed(1)}ms)`,
    avgResponseTime >= 200 ? `Slow response time: ${avgResponseTime.toFixed(1)}ms` : null
  );
  
  // Test 7.2: Cache cleanup efficiency
  const cacheStatsBefore = guards.permissive.getStats();
  
  // Force cache cleanup by waiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Trigger manual cleanup
  guards.permissive.clearCache();
  const cacheStatsAfter = guards.permissive.getStats();
  
  trackTest('performance',
    cacheStatsAfter.deduplication.totalCachedRequests === 0,
    'Cache cleanup functionality',
    cacheStatsAfter.deduplication.totalCachedRequests > 0 ? 'Cache not properly cleared' : null
  );
  
  // Test 7.3: Concurrent request handling
  const concurrentPromises = [];
  const concurrentStart = Date.now();
  
  for (let i = 0; i < 50; i++) {
    concurrentPromises.push(
      guards.disabled.execute( // Use disabled guard for max concurrency
        () => mockApiCall(`concurrent-${i}`, false, Math.random() * 100 + 50),
        { req: createMockRequest(`concurrent-${i}`), skipDeduplication: true }
      )
    );
  }
  
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentTime = Date.now() - concurrentStart;
  
  trackTest('performance',
    concurrentTime < 500, // Should complete quickly with no queuing
    `Concurrent request handling (${concurrentTime}ms for 50 requests)`,
    concurrentTime >= 500 ? `Slow concurrent processing: ${concurrentTime}ms` : null
  );
}

// ========================================================================================
// TEST 8: INTEGRATION & CONFIGURATION  
// ========================================================================================
async function testIntegrationAndConfiguration() {
  console.log('\n🔧 === TEST 8: INTEGRATION & CONFIGURATION ===');
  
  // Test 8.1: Configuration updates
  const originalConfig = guards.permissive.getStats();
  
  guards.permissive.updateConfig({
    deduplication: { ttlSeconds: 1 }
  });
  
  // Test that config change affects behavior
  const configTestReq = createMockRequest('config-test');
  await guards.permissive.execute(
    () => mockApiCall('config-1', false, 50),
    { req: configTestReq, skipQueue: true }
  );
  
  // Wait for new TTL to expire
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const configStart = Date.now();
  await guards.permissive.execute(
    () => mockApiCall('config-2', false, 100),
    { req: configTestReq, skipQueue: true }
  );
  const configTime = Date.now() - configStart;
  
  trackTest('integration',
    configTime >= 90, // Should be fresh call due to short TTL
    `Configuration updates applied (${configTime}ms)`,
    configTime < 90 ? 'Configuration change not applied correctly' : null
  );
  
  // Test 8.2: Statistics accuracy
  const statsBefore = guards.permissive.getStats();
  
  await guards.permissive.execute(
    () => mockApiCall('stats-test', false, 50),
    { req: createMockRequest('stats-test'), skipQueue: true }
  );
  
  const statsAfter = guards.permissive.getStats();
  
  trackTest('integration',
    statsAfter.deduplication.totalCachedRequests > statsBefore.deduplication.totalCachedRequests,
    'Statistics tracking accuracy',
    statsAfter.deduplication.totalCachedRequests === statsBefore.deduplication.totalCachedRequests ? 'Statistics not updated' : null
  );
  
  // Test 8.3: Error handling robustness
  try {
    await guards.permissive.execute(
      () => {
        throw new Error('Unexpected error without status');
      },
      { req: createMockRequest('error-test'), skipDeduplication: true, skipQueue: true }
    );
    trackTest('integration', false, 'Error handling robustness', 'Unexpected error was not caught');
  } catch (error) {
    trackTest('integration',
      error.message === 'Unexpected error without status',
      'Error handling preserves original errors',
      error.message !== 'Unexpected error without status' ? 'Original error modified' : null
    );
  }
  
  // Test 8.4: Null/undefined input handling
  try {
    await guards.permissive.execute(
      () => mockApiCall('null-test', false, 50),
      { req: null, skipDeduplication: true, skipQueue: true }
    );
    trackTest('integration', true, 'Null request handling');
  } catch (error) {
    trackTest('integration', false, 'Null request handling', error.message);
  }
}

// ========================================================================================
// MAIN TEST RUNNER & REPORTING
// ========================================================================================
async function generateTestReport() {
  console.log('\n📊 === COMPREHENSIVE TEST REPORT ===\n');
  
  let totalPassed = 0;
  let totalFailed = 0;
  let criticalIssues = 0;
  
  for (const [category, results] of Object.entries(testResults)) {
    totalPassed += results.passed;
    totalFailed += results.failed;
    
    const success = results.failed === 0;
    const icon = success ? '✅' : '❌';
    
    console.log(`${icon} ${category.toUpperCase()}: ${results.passed} passed, ${results.failed} failed`);
    
    if (results.failed > 0) {
      console.log(`   Issues:`);
      results.issues.forEach(issue => console.log(`   - ${issue}`));
      
      if (category === 'rateLimiting' || category === 'circuitBreaker') {
        criticalIssues += results.failed;
      }
    }
    
    if (results.metrics) {
      console.log(`   Performance Metrics:`);
      Object.entries(results.metrics).forEach(([key, value]) => {
        console.log(`   - ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
      });
    }
  }
  
  console.log(`\n📈 OVERALL RESULTS:`);
  console.log(`Total Tests: ${totalPassed + totalFailed}`);
  console.log(`Passed: ${totalPassed} (${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Critical Issues: ${criticalIssues}`);
  
  // Production Readiness Assessment
  const readinessScore = ((totalPassed / (totalPassed + totalFailed)) * 100);
  let readinessStatus;
  
  if (readinessScore >= 95 && criticalIssues === 0) {
    readinessStatus = '🟢 PRODUCTION READY';
  } else if (readinessScore >= 85 && criticalIssues <= 2) {
    readinessStatus = '🟡 NEEDS MINOR FIXES';
  } else if (readinessScore >= 70) {
    readinessStatus = '🟠 NEEDS MAJOR FIXES';
  } else {
    readinessStatus = '🔴 NOT PRODUCTION READY';
  }
  
  console.log(`\n🎯 PRODUCTION READINESS: ${readinessStatus}`);
  
  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  
  if (testResults.deduplication.failed > 0) {
    console.log(`- Fix deduplication issues - critical for preventing duplicate API calls`);
  }
  
  if (testResults.rateLimiting.failed > 0) {
    console.log(`- Fix rate limiting issues - critical for API cost control`);
  }
  
  if (testResults.circuitBreaker.failed > 0) {
    console.log(`- Fix circuit breaker issues - prevents cascade failures`);
  }
  
  if (testResults.performance.metrics.memoryUsage > 20) {
    console.log(`- Optimize memory usage - high memory consumption detected`);
  }
  
  if (testResults.performance.metrics.averageResponseTime > 100) {
    console.log(`- Optimize response times - consider reducing queue delays`);
  }
  
  if (totalFailed === 0) {
    console.log(`- All tests passed! System is robust and production-ready.`);
    console.log(`- Consider performance monitoring in production environment`);
    console.log(`- Monitor memory usage under sustained high load`);
  }
  
  return readinessScore >= 85;
}

async function runComprehensiveTests() {
  console.log('🚀 Starting COMPREHENSIVE ExecutionGuard Test Suite...\n');
  
  const testStartTime = Date.now();
  
  try {
    await testDeduplicationSystem();
    await testRateLimitingSystem();
    await testCircuitBreakerSystem();
    await testQueueManagement();
    await testRetryLogic();
    await testProviderFallback();
    await testPerformanceAndMemory();
    await testIntegrationAndConfiguration();
    
    const testEndTime = Date.now();
    console.log(`\n⏱️  Total test time: ${((testEndTime - testStartTime) / 1000).toFixed(2)}s\n`);
    
    const isReady = await generateTestReport();
    
    process.exit(isReady ? 0 : 1);
    
  } catch (error) {
    console.error('💥 Test suite failed with critical error:', error);
    process.exit(1);
  }
}

// Run the comprehensive test suite
runComprehensiveTests();