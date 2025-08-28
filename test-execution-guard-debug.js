/**
 * Script de test pentru debug ExecutionGuard - detectează scurgeri și afișează configurația
 */

// Testează prin cereri HTTP către server
async function testGuardedExecute() {
  console.log('🔍 DEBUGGING ExecutionGuard Configuration and Detection');
  console.log('====================================================');
  
  console.log('🚫 Testez prin multiple cereri rapide către server pentru a detecta scurgeri...');
  
  // Testez prin endpoint-ul principal care folosește ExecutionGuard
  const serverUrl = 'http://localhost:3456/v1/messages';
  
  const requests = [];
  for (let i = 0; i < 3; i++) {
    requests.push(
      fetch(serverUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: `Test message ${i}` }],
          max_tokens: 10
        })
      }).then(response => ({
        status: response.status,
        timestamp: Date.now(),
        index: i
      })).catch(error => ({
        error: error.message,
        timestamp: Date.now(),
        index: i
      }))
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    console.log('📊 Responses received:');
    responses.forEach(r => console.log(`  Request ${r.index}: Status ${r.status} at ${new Date(r.timestamp).toISOString()}`));
  } catch (error) {
    console.error('❌ Error during requests:', error.message);
  }
  
  console.log('\n✅ Check server logs for 🔒 GUARDED EXECUTE CALLED messages.');
  console.log('   If present: Guard is working');
  console.log('   If missing: Found a bypass!');
}

testGuardedExecute().catch(console.error);