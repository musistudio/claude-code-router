// Test script pentru Gemini Key Rotation Transformer
const GeminiKeyRotation = require('./src/transformers/gemini-key-rotation.js');

// Testează funcționalitatea de rotire a keys
async function testKeyRotation() {
  console.log('🧪 Testare Gemini Key Rotation Transformer...\n');
  
  // Configurație simulată STANDARD cu api_key (string cu virgule)
  const providerConfig = {
    api_base_url: 'https://generativelanguage.googleapis.com/v1beta/models/',
    api_key: 'AIzaSyDYCq67RM4PSaC9AYtOzsfb8ntuNjlY6I0, AIzaSyAaldy14cPC1eVrOODf0uhPWJBOZbHGEUI, AIzaSyCEpDvYd7P7RNULxNkgbgFOP1i0YGdBjUs, AIzaSyAlm63krfJxBu1QR5ZmvA0rcGUnjm17sng',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash']
  };
  
  // Obiect request simulat
  const mockRequest = {
    body: {
      model: 'gemini-2.5-pro',
      contents: [{
        role: 'user',
        parts: [{ text: 'Hello test!' }]
      }]
    }
  };
  
  // Testează rotirea pentru 10 cereri
  for (let i = 1; i <= 10; i++) {
    console.log(`\n🔹 Cererea #${i}`);
    
    try {
      // Simulează beforeRequest
      const modifiedRequest = await GeminiKeyRotation.beforeRequest(
        JSON.parse(JSON.stringify(mockRequest)), 
        providerConfig
      );
      
      console.log('✅ Request modificat:', {
        url: modifiedRequest.url,
        method: modifiedRequest.method,
        key_index: GeminiKeyRotation.getCurrentKeyIndex()
      });
      
      // Verifică dacă URL-ul conține o cheie API validă
      const currentKeyIndex = GeminiKeyRotation.getCurrentKeyIndex();
      if (currentKeyIndex >= 0 && currentKeyIndex < providerConfig.api_keys.length) {
        const expectedKey = providerConfig.api_keys[currentKeyIndex];
        const actualKeyInUrl = modifiedRequest.url.match(/key=([^&]+)/)?.[1];
        
        if (actualKeyInUrl === expectedKey) {
          console.log(`✅ Cheie corectă: ${actualKeyInUrl}`);
        } else {
          console.log(`❌ Cheie incorectă! Așteptat: ${expectedKey}, Primit: ${actualKeyInUrl}`);
        }
      } else {
        console.log('❌ Index cheie invalid:', currentKeyIndex);
      }
      
    } catch (error) {
      console.error(`❌ Eroare la cererea #${i}:`, error.message);
    }
  }
  
  // Testează funcționalitatea de reset
  console.log('\n🔄 Testare reset index...');
  GeminiKeyRotation.resetIndex();
  console.log('✅ Index resetat la:', GeminiKeyRotation.getCurrentKeyIndex());
  
  // Testează scenariul fără chei API
  console.log('\n❌ Testare fără chei API...');
  try {
    await GeminiKeyRotation.beforeRequest(
      JSON.parse(JSON.stringify(mockRequest)),
      { api_base_url: 'https://api.test.com/', api_keys: [] }
    );
  } catch (error) {
    console.log('✅ Eroare așteptată:', error.message);
  }
  
  console.log('\n✅ Teste finalizate!');
}

// Rulează testele
testKeyRotation().catch(console.error);