# API-uri Existente - Analiză Detaliată

## API Client Bazat

### API Client (api.ts)
- **Base URL:** Configurabil, default `/api`
- **Auth:** Tratează chei API cu interpolare de variabile de mediu
- **Error Handling:** Standard cu retry logic
- **Instance:** Singleton exportat ca `apiClient`

### Mission Control API (missionControlAPI.ts)
- **Base URL:** `/api/v1/mission-control`
- **Instance:** Singleton exportat ca `missionControlAPI`

---

## API Endpoints Disponibile

### 1. Provider Management
```typescript
// Provider status and health
GET /api/v1/mission-control/provider-health
- Response: ProviderHealthResponse[]
- Data: Status provider, health score, error rate, response time

// Provider health history  
GET /api/v1/mission-control/provider-health-history
- Response: HealthHistoryData[]
- Data: Istoric pe provider cu success rate, response time, errors

// Test provider connectivity
POST /api/v1/mission-control/test-provider
- Request: { provider: string, testAction: 'ping' }
- Response: ProviderTestResponse
- Data: Status online/offline, response time
```

### 2. System Control
```typescript
// Circuit breaker reset
POST /api/v1/mission-control/reset-circuit-breaker
- Response: CircuitBreakerResetResponse
- Data: Success status, timestamp

// Execution Guard configuration updates
POST /api/v1/mission-control/update-execution-guard
- Request: { action: 'update-preset' | 'update-custom', preset: 'economy' | 'balanced' | 'high-throughput' } | { action: 'update-custom', config: {...} }
- Response: ExecutionGuardUpdateResponse
- Data: New configuration, success status

// Emergency operations
POST /api/v1/mission-control/emergency-stop
POST /api/v1/mission-control/resume
- Response: { success: boolean, message: string }
```

### 3. Route Management
```typescript
// Update route configuration
POST /api/v1/mission-control/update-route
- Request: { routeName: string, newModel: string }
- Response: RouteConfigUpdateResponse
- Data: Old route, new model, success status

// Get route efficiency data
GET /api/v1/mission-control/route-efficiency
- Response: Any (detalii necunoscute)
- Data: Performance metrics pe rute
```

### 4. Analytics and Monitoring
```typescript
// Live activity feed
GET /api/v1/mission-control/live-activity
- Response: Any
- Data: Cereri live cu model, provider, status, latență

// System health status
GET /api/v1/mission-control/system-health
- Response: Any
- Data: Stare generală sistem

// Threat matrix data
GET /api/v1/mission-control/threat-matrix
- Response: Any
- Data: Rate limiting usage, circuit breaker state

// Model performance leaderboard
GET /api/v1/mission-control/model-performance
- Response: Any
- Data: Performance modele cu success rate, response time

// Historical performance data
GET /api/v1/mission-control/historical-performance
- Response: Any
- Data: Performance istorică (24 de ore?)

// Aggregated analytics
GET /api/v1/mission-control/aggregated-data
- Response: Any
- Data: Date agregate generale

// ALL-in-one endpoint
GET /api/v1/mission-control/stats
- Response: Any
- Data: Toate datele de mai sus într-un singur call (recomandat!)
```

---

## Structuri Date Existente

### ProviderHealthStatus
```typescript
interface ProviderHealthStatus {
  id: string;                      // ID provider
  name: string;                    // Nume provider
  provider: string;               // Denumire provider
  status: 'online' | 'offline' | 'degraded'; // Stare
  healthScore: number;            // Scor 0-100
  avgResponseTime: number;        // Timp mediu răspuns (ms)
  errorRate: number;              // Rata erori (%)
  totalRequests: number;          // Total cereri
  lastCheck: string;              // Ultima verificare (ISO string)
  features: string[];             // Suportate features
}
```

### HealthHistoryData
```typescript
interface HealthHistoryData {
  provider: string;              // Nume provider
  timestamp: string;             // Timestamp (ISO string)
  successRate: number;           // Rata succes (%)
  avgResponseTime: number;       // Timp mediu răspuns (ms)
  errorCount: number;           // Număr erori
  errorRate?: number;           // Rată erori (%)
  totalRequests?: number;        // Total cereri
  hourlyStats?: any[];           // Statistici orare
}
```

### Activity Data (din getLiveActivity)
```typescript
interface ActivityLog {
  id?: string;                   // ID activitate
  timestamp: Date;              // Timestamp
  model: string;                // Model folosit
  provider: string;             // Provider folosit
  endpoint?: string;            // Endpoint API
  status: 'success' | 'error' | 'retrying' | 'cached';
  latency: number;              // Timp latență (ms)
  retries?: number;             // Număr reîncercări
  cached?: boolean;            // Din cache
  route?: string;              // Rută folosită
  originalModel?: string;      // Model original
  actualModel?: string;        // Model folosit real
  statusCode?: number;         // HTTP status code
}
```

---

## Date Necesare pentru Noile Widget-uri

### 1. Route Monitor Widget
```typescript
// Date necesare care LIPSESC:
interface RouteUsage {
  route: string;               // 'default', 'background', 'think', 'webSearch', 'longContext'
  requests: number;             // Număr cereri pe rută
  configuredModel: string;      // Model setat de user
  actualModel: string;          // Model folosit real
  cost: number;                // Cost per rută
  avgResponseTime: number;      // Timp mediu răspuns
  successRate: number;         // Rata succes
  recentLogs: ActivityLog[];    // Activități recente
  status: 'active' | 'warning' | 'error';
}

interface SessionStats {
  totalRequests: number;        // Total cereri sesiune
  totalCost: number;           // Cost total sesiune
  avgResponseTime: number;      // Timp mediu răspuns
  mostUsedRoute: string;       // Rută cea mai folosită
  modelOverrides: number;      // Câte ori model diferit
  fallbacks: number;           // Câte ori fallback provider
  sessionStart: Date;          // Start sesiune
}
```

### 2. Cost Optimizer Widget
```typescript
// Date necesare:
interface CostOptimization {
  totalSavings: number;         // Economisii totale estimate
  recommendations: OptimizationRecommendation[];
  currentMonthlyCost: number;   // Cost lunar curent
  projectedMonthlyCost: number; // Cost lunar proiectat
}

interface OptimizationRecommendation {
  id: string;                  // ID recomandare
  title: string;               // Titlu recomandare
  description: string;          // Descriere
  savings: number;             // Economisii estimate
  action: 'auto-apply' | 'manual' | 'settings-change';
  status: 'pending' | 'applied' | 'dismissed';
}
```

### 3. Performance Alert Widget
```typescript
// Date necesare:
interface PerformanceAlert {
  id: string;                   // ID alertă
  severity: 'critical' | 'warning' | 'info';
  title: string;               // Titlu alertă
  description: string;         // Descriere
  action: string;              // Acțiune recomandată
  impact: string;              // Impact dacă nu se rezolvă
  timestamp: Date;             // Timestamp alertă
  resolved: boolean;           // Dacă e rezolvată
}
```

### 4. System Health Checker Widget
```typescript
// Date necesare (există deja în getSystemHealth):
interface SystemHealth {
  overall: 'operational' | 'issues' | 'critical';
  components: {
    providers: { [name: string]: 'online' | 'offline' | 'degraded' };
    routes: { [name: string]: 'active' | 'warning' | 'error' };
    cache: { hitRate: number, size: number };
    rateLimit: { usage: number, limit: number };
  };
  alerts: SystemAlert[];
}

interface SystemAlert {
  type: 'warning' | 'critical' | 'info';
  message: string;
  autoFix: boolean;
  manualAction?: string;
}
```

---

## Endpoints Necesare (pot fi create)

### 1. Route Usage Tracking
```typescript
// NOU: /api/v1/mission-control/routes/usage
GET /api/v1/mission-control/routes/usage
- Response: { routes: RouteUsage[], session: SessionStats }

// NOU: /api/v1/mission-control/routes/config
GET /api/v1/mission-control/routes/config
- Response: { [routeName: string]: { configuredModel: string } }
```

### 2. Cost Optimization
```typescript
// NOU: /api/v1/mission-control/cost/optimizations
GET /api/v1/mission-control/cost/optimizations
- Response: CostOptimization

// NOU: /api/v1/mission-control/cost/apply
POST /api/v1/mission-control/cost/apply
- Request: { optimizationId: string }
- Response: { success: boolean, newConfig: any }
```

### 3. Performance Alerts
```typescript
// NOU: /api/v1/mission-control/performance/alerts
GET /api/v1/mission-control/performance/alerts
- Response: PerformanceAlert[]

// NOU: /api/v1/mission-control/performance/resolve
POST /api/v1/mission-control/performance/resolve
- Request: { alertId: string }
- Response: { success: boolean, resolved: boolean }
```

### 4. Cost Forecast
```typescript
// NOU: /api/v1/mission-control/forecast/cost-usage
GET /api/v1/mission-control/forecast/cost-usage
- Response: { 
    currentMonth: { projected: number, actual: number },
    nextMonth: { projected: number, factors: string[] },
    budgetAlert?: boolean
  }
```

---

## Observații și Limitări

### 1. Date Disponibile
- ✅ Provider health status și istoric
- ✅ Live activity cu model și provider tracking
- ✅ Route efficiency (dar fără detalii pe model)
- ❌ Tracking costuri real-time (lipsește)
- ❌ Cost optimization suggestions (lipsește)
- ❌ Performance alerts automate (lipsește)
- ❌ Forecast bazat pe trenduri (lipsește)

### 2. Date Dezglobale
```typescript
// Din getMissionControlStats există:
- Total requests (aggregated.totalRequests)
- Success rate (aggregated.successRate)
- Avg response time (aggregated.avgResponseTime)
- Model stats (aggregated.modelStats) - dar nu pe rute
- Rate limiting usage (live.rateLimiting.rulesUsage)
- Queue metrics (live.queue)
```

### 3. Date care Trebuiesc Infimate
Pentru demo și prototipare, vom folosi:
- Număr request-uri per rută (random bazat pe model)
- Cost estimate (random bazat pe tip model)
- Activități recente (din historical data)
- Model tracking (presupunem că folosește modelul configurat)

### 4. Realimentare API-uri
Pentru producție:
- Adăugare endpoints noi în missionControlAPI.ts
- Creare de date mai precise pe rute
- Implementare cost tracking în backend
- Adăugare alerte automate
- Forecast bazat pe machine learning

---

## Recomandări pentru Implementare

### 1. Folosește getMissionControlStats
Endpoint-ul `/api/v1/mission-control/stats` este cel mai bun deoarece:
- Returnează toate datele în un singur call
- Nu faceți request-uri multiple
- Date sunt deja normalizate în useMissionControlData

### 2. Extinde hooks-ul existent
Folosiți `useMissionControlData` ca bază și extindeți cu:
```typescript
// Extindere useRouteMonitorData
- Extrage datele necesare din răspunsul existent
- Calculează metrici derivată
- Adaugă logică de caching și refresh

// Extindere usePerformanceAlerts
- Analizează datele live pentru a detecta probleme
- Generează alerte automate pe baza unor praguri
```

### 3. Adaugă noi hooks în faza 2
Când API-uri noi sunt gata:
```typescript
export function useCostOptimizer() { /* ... */ }
export function usePerformanceAlerts() { /* ... */ }
export function useProviderManager() { /* ... */ }
```

### 4. Mock Data pentru Development
Când API-ul returnează date incomplete, folosiți:
```typescript
const routeData = mockRouteData(missionControlData);
const costOptimization = mockCostOptimization();
const alerts = mockPerformanceAlerts();
```

---

## Concluzii

1. **API-urile existente sunt suficiente** pentru prototipare
2. **Datele pentru Route Monitor** pot fi extrase din getMissionControlStats
3. **Datele pentru Cost Optimizer** vor necesita calcul suplimentar
4. **API-uri noi necesare** pentru producție (cost tracking, alerts, forecasting)
5. **Faza 1 poate fi completată** cu date existente + mock data
6. **Faza 2 va necesita** adăugare endpoints noi în backend