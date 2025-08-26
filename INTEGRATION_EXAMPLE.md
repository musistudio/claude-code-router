# ExecutionGuard - Exemple de Integrare

## 1. Integrare în Server Principal

### A. În `src/index.ts` sau `src/server.ts`:

```typescript
import { executionGuard, guardedExecute } from './utils/ExecutionGuard';

// Configurează ExecutionGuard la startup
const initializeExecutionGuard = () => {
  // Citeste configurația din config.json
  const config = loadConfig();
  
  if (config.executionGuard?.enabled) {
    executionGuard.updateConfig({
      deduplication: {
        enabled: config.executionGuard.deduplication?.enabled ?? true,
        ttlSeconds: config.executionGuard.deduplication?.ttlSeconds ?? 30
      },
      rateLimiting: {
        enabled: config.executionGuard.rateLimiting?.enabled ?? true,
        rules: {
          perMinute: { 
            requests: config.executionGuard.rateLimiting?.perMinute ?? 60, 
            windowMs: 60000 
          }
        }
      },
      // ... alte configurări
    });
    
    console.log('✅ ExecutionGuard initialized');
  }
};

// La startup
initializeExecutionGuard();
```

### B. În handler-ul principal de request:

```typescript
// Înlocuiește logica existentă de request handling
app.post('/v1/messages', async (request, reply) => {
  try {
    // În loc să faci direct call către provider:
    // const response = await llmProvider.call(request.body);
    
    // Folosește ExecutionGuard:
    const response = await guardedExecute(
      async () => {
        // Logica existentă de API call
        return await llmProvider.call(request.body);
      },
      {
        req: request,
        keyId: `api-${request.body.model}`,
        providerName: getCurrentProviderName(request),
        // skipQueue: false,     // Folosește queue-ul pentru smooth traffic
        // skipDeduplication: false  // Permite caching pentru request-uri identice
      }
    );
    
    return reply.send(response);
    
  } catch (error) {
    // Error handling îmbunătățit
    if (error.message.includes('Rate limit exceeded')) {
      return reply.code(429).send({ 
        error: 'Too Many Requests', 
        message: error.message,
        retryAfter: extractRetryAfter(error)
      });
    }
    
    if (error.message.includes('Circuit breaker')) {
      return reply.code(503).send({ 
        error: 'Service Temporarily Unavailable',
        message: 'System is recovering from high load'
      });
    }
    
    throw error; // Other errors
  }
});
```

## 2. Monitoring Endpoint

```typescript
// Adaugă endpoint pentru statistici
app.get('/api/execution-guard/stats', async (request, reply) => {
  const stats = executionGuard.getStats();
  
  return reply.send({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    executionGuard: {
      ...stats,
      // Formatează pentru dashboard
      summary: {
        cacheEfficiency: `${(stats.deduplication.cacheHitRate * 100).toFixed(1)}%`,
        requestsInQueue: stats.queue.currentSize,
        systemStatus: stats.rateLimiting.circuitBreakerState,
        avgResponseTime: `${stats.queue.averageWaitTime.toFixed(0)}ms`
      }
    }
  });
});

// Endpoint pentru control manual
app.post('/api/execution-guard/reset', async (request, reply) => {
  const { component } = request.body;
  
  switch (component) {
    case 'circuit-breaker':
      executionGuard.resetCircuitBreaker();
      return reply.send({ message: 'Circuit breaker reset' });
      
    case 'cache':
      executionGuard.clearCache();
      return reply.send({ message: 'Cache cleared' });
      
    default:
      return reply.code(400).send({ error: 'Invalid component' });
  }
});
```

## 3. Utilizare pentru Request-uri Specifice

### A. Pentru Claude Code Router:

```typescript
// În funcția de routing către diferite provideri
const routeToProvider = async (providerConfig, request) => {
  const providerName = providerConfig.name;
  
  // Check provider health
  if (!isProviderHealthy(providerName)) {
    console.warn(`Provider ${providerName} is in recovery, consider fallback`);
  }
  
  return await guardedExecute(
    async () => {
      // Setup request pentru provider specific
      const apiCall = setupProviderRequest(providerConfig, request);
      return await makeHttpRequest(apiCall.url, apiCall.options);
    },
    {
      req: request,
      keyId: `provider-${providerName}`,
      providerName
    }
  );
};
```

### B. Pentru background tasks:

```typescript
// Task-uri care nu trebuie să impacteze request-urile principale
const backgroundTask = async () => {
  return await guardedExecute(
    async () => {
      // Logica de background processing
      return await processAnalytics();
    },
    {
      keyId: 'background-analytics',
      // skipQueue: true,    // Background tasks pot să sară coada
      // skipDeduplication: true  // Să nu interfere cu cache-ul principal
    }
  );
};
```

## 4. Configurare în config.json

```json
{
  "executionGuard": {
    "enabled": true,
    "deduplication": {
      "enabled": true,
      "ttlSeconds": 30,
      "maxCacheSize": 1000,
      "excludeEndpoints": ["/api/analytics", "/ui/", "/api/test"]
    },
    "rateLimiting": {
      "enabled": true,
      "rules": {
        "perMinute": 60,
        "perHour": 500,
        "perDay": 5000,
        "burstLimit": 10
      },
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 20,
        "recoveryTimeMs": 60000
      }
    },
    "queue": {
      "enabled": true,
      "minDelayMs": 1000,
      "maxQueueSize": 100
    },
    "retry": {
      "enabled": true,
      "maxRetries": 5,
      "initialBackoffMs": 1000,
      "maxBackoffMs": 30000
    },
    "fallback": {
      "enabled": true,
      "recoveryWindowMs": 60000
    }
  }
}
```

## 5. Dashboard Integration

### A. În UI dashboard:

```typescript
// src/components/ExecutionGuardDashboard.tsx
import { useEffect, useState } from 'react';

const ExecutionGuardDashboard = () => {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      const response = await fetch('/api/execution-guard/stats');
      const data = await response.json();
      setStats(data.executionGuard);
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Update every 5s
    
    return () => clearInterval(interval);
  }, []);
  
  if (!stats) return <div>Loading...</div>;
  
  return (
    <div className="execution-guard-dashboard">
      <h3>Execution Guard Status</h3>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Cache Efficiency</h4>
          <div className="stat-value">{stats.summary.cacheEfficiency}</div>
        </div>
        
        <div className="stat-card">
          <h4>Queue Size</h4>
          <div className="stat-value">{stats.summary.requestsInQueue}</div>
        </div>
        
        <div className="stat-card">
          <h4>System Status</h4>
          <div className={`stat-value status-${stats.summary.systemStatus.toLowerCase()}`}>
            {stats.summary.systemStatus}
          </div>
        </div>
        
        <div className="stat-card">
          <h4>Avg Response Time</h4>
          <div className="stat-value">{stats.summary.avgResponseTime}</div>
        </div>
      </div>
      
      {/* Circuit breaker controls */}
      {stats.summary.systemStatus === 'OPEN' && (
        <div className="circuit-breaker-controls">
          <button onClick={() => resetCircuitBreaker()}>
            Reset Circuit Breaker
          </button>
        </div>
      )}
    </div>
  );
};
```

### B. CSS pentru dashboard:

```css
.execution-guard-dashboard {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 15px;
}

.stat-card {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 6px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  margin-top: 8px;
}

.status-closed { color: #28a745; }
.status-open { color: #dc3545; }
.status-half_open { color: #ffc107; }

.circuit-breaker-controls {
  margin-top: 15px;
  text-align: center;
}

.circuit-breaker-controls button {
  background: #dc3545;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}
```

## 6. Migrarea de la Sistemele Existente

### A. Înlocuiește request-deduplication.ts:

```typescript
// ÎNAINTE:
import { requestDeduplicationService } from './utils/request-deduplication';

const result = requestDeduplicationService.isDuplicateRequest(req);
if (result.isDuplicate) {
  return result.cachedResponse;
}

// Execute request...
const response = await makeApiCall();

requestDeduplicationService.cacheResponse(req, response);

// DUPĂ:
import { guardedExecute } from './utils/ExecutionGuard';

const response = await guardedExecute(
  () => makeApiCall(),
  { req }
);
```

### B. Înlocuiește rate-limiter.ts:

```typescript
// ÎNAINTE:
import { rateLimiter } from './utils/rate-limiter';

const limitResult = rateLimiter.shouldLimit(req);
if (limitResult.limited) {
  throw new Error(`Rate limited: ${limitResult.reason}`);
}

// DUPĂ - inclus automat în guardedExecute:
// Doar folosește guardedExecute și ExecutionGuard se ocupă de rate limiting
```

### C. Înlocuiește fetch-interceptor.ts:

```typescript
// ÎNAINTE:
import { applyFetchInterceptor } from './utils/fetch-interceptor';
applyFetchInterceptor(); // La startup

// DUPĂ - retry logic inclus în ExecutionGuard:
// Nu mai e nevoie de interceptor global
```

## 7. Testing Integration

```bash
# Rulează testul
node test-execution-guard.js

# Test cu request-uri reale
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"test"}]}'

# Verifică statistici
curl http://localhost:3000/api/execution-guard/stats
```

ExecutionGuard oferă o soluție completă și robustă pentru controlul traficului, menținând flexibilitatea necesară pentru cazuri de utilizare complexe.