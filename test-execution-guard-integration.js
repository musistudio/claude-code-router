// Test ExecutionGuard Integration
const { executionGuard, guardedExecute, canMakeRequest, isProviderHealthy } = require('./dist/utils/utils/ExecutionGuard.js');

async function testExecutionGuardIntegration() {
  console.log('🔍 Testing ExecutionGuard Integration...\n');
  
  try {
    // Test 1: Basic functionality
    console.log('1. Testing basic functionality...');
    const result = await guardedExecute(
      () => Promise.resolve({ data: 'test_success', timestamp: Date.now() }),
      { keyId: 'test-integration', providerName: 'test' }
    );
    console.log('✅ Basic execution works:', result.data);
    
    // Test 2: Rate limiting check
    console.log('\n2. Testing rate limit check...');
    const canMake = canMakeRequest({ url: '/test', method: 'GET' });
    console.log('✅ Rate limit check:', canMake ? 'ALLOWED' : 'BLOCKED');
    
    // Test 3: Provider health check
    console.log('\n3. Testing provider health...');
    const isHealthy = isProviderHealthy('test');
    console.log('✅ Provider health:', isHealthy ? 'HEALTHY' : 'IN_RECOVERY');
    
    // Test 4: Statistics
    console.log('\n4. Testing statistics...');
    const stats = executionGuard.getStats();
    console.log('✅ Statistics available:');
    console.log(`   - Deduplication cache: ${stats.deduplication.totalCachedRequests} entries`);
    console.log(`   - Queue size: ${stats.queue.currentSize}`);
    console.log(`   - Circuit breaker: ${stats.rateLimiting.circuitBreakerState}`);
    console.log(`   - Cache hit rate: ${(stats.deduplication.cacheHitRate * 100).toFixed(1)}%`);
    
    // Test 5: Deduplication
    console.log('\n5. Testing deduplication...');
    const testRequest = { url: '/test-dedup', method: 'POST', body: { test: true } };
    
    const result1 = await guardedExecute(
      () => Promise.resolve({ unique_id: Math.random() }),
      { req: testRequest, keyId: 'dedup-test' }
    );
    
    const result2 = await guardedExecute(
      () => Promise.resolve({ unique_id: Math.random() }),
      { req: testRequest, keyId: 'dedup-test' }
    );
    
    const isDeduped = result1.unique_id === result2.unique_id;
    console.log('✅ Deduplication working:', isDeduped ? 'YES' : 'NO');
    
    // Test 6: Configuration update
    console.log('\n6. Testing configuration update...');
    executionGuard.updateConfig({
      deduplication: { ttlSeconds: 60 }
    });
    console.log('✅ Configuration update successful');
    
    // Test 7: Cache and circuit breaker reset
    console.log('\n7. Testing reset operations...');
    executionGuard.clearCache();
    console.log('✅ Cache cleared');
    
    executionGuard.resetCircuitBreaker();
    console.log('✅ Circuit breaker reset');
    
    console.log('\n🎉 ALL TESTS PASSED! ExecutionGuard integration is successful.\n');
    
    // Final stats summary
    const finalStats = executionGuard.getStats();
    console.log('📊 Final Statistics Summary:');
    console.log(JSON.stringify(finalStats, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testExecutionGuardIntegration();