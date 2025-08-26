const http = require('http');

const testEndpoints = [
  '/api/test',
  '/api/advanced-system/overview',
  '/api/config'
];

function testEndpoint(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3456${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          endpoint,
          status: res.statusCode,
          data: data.substring(0, 100) + (data.length > 100 ? '...' : '')
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        endpoint,
        error: err.message
      });
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({
        endpoint,
        error: 'Timeout'
      });
    });
  });
}

async function runTests() {
  console.log('Testing API endpoints...\n');
  
  for (const endpoint of testEndpoints) {
    const result = await testEndpoint(endpoint);
    console.log(`${endpoint}:`, JSON.stringify(result, null, 2));
    console.log('---');
  }
}

runTests().catch(console.error);