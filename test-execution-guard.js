#!/usr/bin/env tsx

/**
 * Test script pentru ExecutionGuard
 * Rulează: node test-execution-guard.js
 */

// Import ExecutionGuard from source
const { ExecutionGuard, guardedExecute, canMakeRequest } = require('./src/utils/ExecutionGuard');

// Creează o instanță de test cu configurare relaxată
const testGuard = new ExecutionGuard({
  deduplication: {
    enabled: true,
    ttlSeconds: 10, // 10 secunde pentru test
    maxCacheSize: 50
  },
  rateLimiting: {
    enabled: true,
    rules: {
      perMinute: { requests: 20, windowMs: 60000 },
      perHour: { requests: 100, windowMs: 3600000 },
      perDay: { requests: 1000, windowMs: 86400000 },
      burst: { requests: 5, windowMs: 10000 }
    }
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    recoveryTimeMs: 5000 // 5 secunde recovery
  },
  queue: {
    enabled: true,
    minDelayMs: 200, // 200ms între cereri
    maxQueueSize: 10
  },
  retry: {
    enabled: true,
    maxRetries: 2,
    initialBackoffMs: 500,
    maxBackoffMs: 2000
  },
  persistence: {
    enabled: false // Disable pentru test
  }
});

// Mock request simulat
function createMockRequest(id, shouldFail = false) {
  return {
    url: `/api/test/${id}`,
    method: 'POST',
    body: { id, timestamp: Date.now() },
    sessionId: 'test-session'
  };
}

// Mock API call care poate să eșueze
function mockApiCall(id, shouldFail = false, delay = 100) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        const error = new Error(`API Error for ${id}`);
        error.status = Math.random() > 0.5 ? 429 : 500; // Random retriable error
        reject(error);
      } else {
        resolve({ id, data: `Response for ${id}`, timestamp: Date.now() });
      }
    }, delay);
  });
}

async function testDeduplication() {
  console.log('\n=== Test 1: Deduplication ===');
  
  const req = createMockRequest('duplicate-test');
  
  // Primul request
  const start1 = Date.now();
  const result1 = await testGuard.execute(
    () => mockApiCall('duplicate-test', false, 300),
    { req, keyId: 'test-key' }
  );
  const time1 = Date.now() - start1;
  
  // Al doilea request identic (ar trebui să fie cached)
  const start2 = Date.now();
  const result2 = await testGuard.execute(
    () => mockApiCall('duplicate-test-different', false, 300), // Response diferit dar request identic
    { req, keyId: 'test-key' }
  );
  const time2 = Date.now() - start2;
  
  console.log(`Primera cerere: ${time1}ms`);
  console.log(`A doua cerere (deduplicated): ${time2}ms`);
  console.log(`Deduplication working: ${time2 < 50 && JSON.stringify(result1) === JSON.stringify(result2)}`);
  console.log(`Results identical: ${JSON.stringify(result1) === JSON.stringify(result2)}`);
}

async function testRateLimiting() {
  console.log('\n=== Test 2: Rate Limiting ===');
  
  try {
    // Încearcă să facă multe cereri rapid
    const requests = [];
    for (let i = 0; i < 7; i++) { // Peste limita de burst (5)
      requests.push(
        testGuard.execute(
          () => mockApiCall(`rate-test-${i}`, false, 50),
          { req: createMockRequest(`rate-test-${i}`), skipDeduplication: true }
        )
      );
    }
    
    await Promise.all(requests);
    console.log('❌ Rate limiting nu funcționează - toate cererile au trecut');
  } catch (error) {
    console.log(`✅ Rate limiting funcționează: ${error.message}`);
  }
}

async function testRetryLogic() {
  console.log('\n=== Test 3: Retry Logic ===');
  
  let attemptCount = 0;
  const mockFailingCall = () => {
    attemptCount++;
    console.log(`  Attempt ${attemptCount}`);
    
    if (attemptCount < 2) {
      const error = new Error('Temporary failure');
      error.status = 429; // Retriable error
      throw error;
    }
    
    return { success: true, attempts: attemptCount };
  };
  
  try {
    const result = await testGuard.execute(
      mockFailingCall,
      { req: createMockRequest('retry-test'), skipDeduplication: true, skipQueue: true }
    );
    
    console.log(`✅ Retry successful after ${result.attempts} attempts`);
  } catch (error) {
    console.log(`❌ Retry failed: ${error.message}`);
  }
}

async function testQueueManagement() {
  console.log('\n=== Test 4: Queue Management ===');
  
  const startTime = Date.now();
  const requests = [];
  
  // Adaugă 5 cereri în queue
  for (let i = 0; i < 5; i++) {
    requests.push(
      testGuard.execute(
        () => mockApiCall(`queue-test-${i}`, false, 100),
        { req: createMockRequest(`queue-test-${i}`), skipDeduplication: true }
      ).then(result => ({
        ...result,
        processedAt: Date.now() - startTime
      }))
    );
  }
  
  const results = await Promise.all(requests);
  
  console.log('Queue processing times:');
  results.forEach((result, i) => {
    console.log(`  Request ${i}: processed at ${result.processedAt}ms`);
  });
  
  // Verifică că cererile au fost procesate secvențial cu delay
  const intervals = results.slice(1).map((result, i) => 
    result.processedAt - results[i].processedAt
  );
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  console.log(`Average interval between requests: ${avgInterval}ms`);
  console.log(`Queue working correctly: ${avgInterval >= 180}`); // Aproximativ 200ms delay + processing time
}

async function testCircuitBreaker() {
  console.log('\n=== Test 5: Circuit Breaker ===');
  
  try {
    // Încearcă să cauzeze 3 failure-uri consecutive pentru a deschide circuit breaker-ul
    for (let i = 0; i < 4; i++) {
      try {
        await testGuard.execute(
          () => mockApiCall(`circuit-test-${i}`, true), // Force failure
          { req: createMockRequest(`circuit-test-${i}`), skipDeduplication: true, skipQueue: true }
        );
      } catch (error) {
        console.log(`  Failure ${i + 1}: ${error.message}`);
      }
    }
    
    // Încearcă o cerere după ce circuit breaker ar trebui să fie deschis
    await testGuard.execute(
      () => mockApiCall('after-circuit-break', false),
      { req: createMockRequest('after-circuit-break'), skipDeduplication: true, skipQueue: true }
    );
    
    console.log('❌ Circuit breaker nu s-a deschis');
  } catch (error) {
    if (error.message.includes('Circuit breaker')) {
      console.log('✅ Circuit breaker funcționează');
    } else {
      console.log(`❌ Altă eroare: ${error.message}`);
    }
  }
}

async function showStatistics() {
  console.log('\n=== Statistics ===');
  const stats = testGuard.getStats();
  
  console.log('Deduplication:');
  console.log(`  Cached requests: ${stats.deduplication.totalCachedRequests}`);
  console.log(`  Blocked duplicates: ${stats.deduplication.totalDuplicateRequestsBlocked}`);
  console.log(`  Cache hit rate: ${(stats.deduplication.cacheHitRate * 100).toFixed(1)}%`);
  
  console.log('\nRate Limiting:');
  console.log(`  Circuit breaker state: ${stats.rateLimiting.circuitBreakerState}`);
  console.log(`  Tracked requests: ${stats.rateLimiting.totalRequestsTracked}`);
  
  console.log('\nQueue:');
  console.log(`  Current size: ${stats.queue.currentSize}`);
  console.log(`  Total processed: ${stats.queue.totalProcessed}`);
  console.log(`  Average wait time: ${stats.queue.averageWaitTime.toFixed(1)}ms`);
  
  console.log('\nRetry:');
  console.log(`  Total retries: ${stats.retry.totalRetries}`);
  console.log(`  Success after retry: ${stats.retry.successAfterRetry}`);
  console.log(`  Final failures: ${stats.retry.finalFailures}`);
}

async function runAllTests() {
  console.log('🚀 Starting ExecutionGuard Tests...\n');
  
  try {
    await testDeduplication();
    await testRateLimiting();
    await testRetryLogic();
    await testQueueManagement();
    await testCircuitBreaker();
    await showStatistics();
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Rulează testele
runAllTests();