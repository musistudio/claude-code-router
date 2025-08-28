# ColumnLeft: Real Time Operations Widgets

## Overview

ColumnLeft - Real Time Operations este panoul stânga al dashboard-ului Mission Control, specializat în monitoring-ul în timp real al sistemului. Componenta afișează activitatea live, statusul sistemului și matricea de amenințări pentru a oferi o imagine completă a sănătății sistemului în timp real.

## Componenta ColumnLeft_RealTimeOps.tsx

### Descriere
Componenta principală pentru operațiunile în timp real, care colectează și afișează:
- Feed de activitate live
- Statusul Circuit Breaker
- Metrici de activitate (requesturi, success rate, response time)
- Starea provider-ilor
- Matricea de amenințări (Threat Matrix)
- Alerte sistem și status

### Props

| Prop | Tip | Opțional | Descriere |
|------|-----|----------|-----------|
| className | string | Da | Clase CSS aditionale pentru containerul column-ului |

### State Management
- `data`: Datele primite din hook-ul `useMissionControlData`
- `loading`: Statusul de încărcare a datelor
- `error`: Mesajul de eroare (dacă există)

### Dependencies și Imports

```typescript
import { motion } from 'framer-motion';
import { useMissionControlData } from '@/hooks/useMissionControlData';
import { Activity, Shield, Zap, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { ThreatMatrix } from './widgets/ThreatMatrix';
import { LiveActivityFeed } from './widgets/LiveActivityFeed';
```

### Stiluri și CSS Classes

#### Container principal:
- `space-y-6`: Spacing vertical între elemente
- `glass-card`: Card-uri cu efect de sticlă
- `grid grid-cols-1 md:grid-cols-3`: Grid responsive pentru statuse

#### Componente individuale:
- **Circuit Breaker Status**: Shield icon cu status (CLOSED/OPEN)
- **Request Activity**: Activity icon cu metrici live
- **Provider Health**: Zap icon cu status provider
- **Threat Matrix**: Secțiune dedicată pentru amenințări

### Interacțiuni cu API

#### Hook-ul useMissionControlData:
```typescript
const { data, loading, error } = useMissionControlData({
  interval: 15000, // Update la 15 secunde
  initialLoad: true,
  retryCount: 3,
});
```

API calls:
- `/api/mission-control/live`: Date live (queue, rate limiting, providers)
- `/api/mission-control/threat-matrix`: Amenințări și rate limiting

### Structura Componentei

#### 1. Loading State
Afișează o animatie de încărcare cu icon Activity:
```typescript
if (loading) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-pulse text-center">
        <Activity className="h-8 w-8 mx-auto mb-4 text-blue-500" />
        <p className="text-gray-300">Loading real-time data...</p>
      </div>
    </div>
  );
}
```

#### 2. Error State
Afișează mesaj de eroare cu icon AlertTriangle:
```typescript
if (error) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
        <p className="text-red-400">Error loading data: {error}</p>
      </div>
    </div>
  );
}
```

#### 3. Live Activity Feed (Widget Top)
Feed-ul de activitate live este amplasat în partea superioară a column-ului, afișând ultimele evenimente din sistem cu detalii precum:
- Timestamp
- Tipul evenimentului
- Status (succes/eroare)
- Response time
- Provider asociat

#### 4. System Status Cards (Grid 3x)
Trei carduri principale în grid responsive:

##### Circuit Breaker Status
```typescript
<div className="glass-card p-6">
  <div className="flex items-center gap-3 mb-4">
    <Shield className={`h-6 w-6 ${
      data?.live?.rateLimiting?.circuitBreakerState === 'CLOSED' 
        ? 'text-green-500' 
        : 'text-red-500'
    }`} />
    <h3 className="text-lg font-semibold">Circuit Breaker</h3>
  </div>
  <div className="space-y-3">
    <div className="flex justify-between">
      <span className="text-gray-400">State:</span>
      <span className={`font-medium ${
        data?.live?.rateLimiting?.circuitBreakerState === 'CLOSED' 
          ? 'text-green-400' 
          : 'text-red-400'
      }`}>
        {data?.live?.rateLimiting?.circuitBreakerState || 'Unknown'}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Queue Size:</span>
      <span className="text-white font-medium">
        {data?.live?.queue?.currentSize || 0}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Processed:</span>
      <span className="text-blue-400 font-medium">
        {data?.live?.queue?.totalProcessed || 0}
      </span>
    </div>
  </div>
</div>
```

##### Request Activity
```typescript
<div className="glass-card p-6">
  <div className="flex items-center gap-3 mb-4">
    <Activity className="h-6 w-6 text-blue-500" />
    <h3 className="text-lg font-semibold">Activity</h3>
  </div>
  <div className="space-y-3">
    <div className="flex justify-between">
      <span className="text-gray-400">Total Requests:</span>
      <span className="text-white font-medium">
        {data?.aggregated?.totalRequests || 0}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Success Rate:</span>
      <span className="text-green-400 font-medium">
        {data?.aggregated?.successRate || 0}%
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-400">Avg Response:</span>
      <span className="text-purple-400 font-medium">
        {Math.round(data?.aggregated?.avgResponseTime || 0)}ms
      </span>
    </div>
  </div>
</div>
```

##### Provider Health
```typescript
<div className="glass-card p-6">
  <div className="flex items-center gap-3 mb-4">
    <Zap className="h-6 w-6 text-orange-500" />
    <h3 className="text-lg font-semibold">Providers</h3>
  </div>
  <div className="space-y-3">
    {data?.live?.providers ? 
      Object.entries(data.live.providers)
        .slice(0, 2)
        .map(([name, provider]: [string, any]) => (
          <div key={name} className="flex justify-between items-center">
            <span className="text-gray-400 text-sm truncate">
              {name.split('-')[0]}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {provider.failureCount || 0} fails
              </span>
              {provider.inRecovery ? (
                <Clock className="h-3 w-3 text-yellow-400" />
              ) : (
                <CheckCircle className="h-3 w-3 text-green-400" />
              )}
            </div>
          </div>
        )) : (
      <p className="text-gray-500 text-sm">No provider data</p>
    )}
  </div>
</div>
```

#### 5. Threat Matrix & System Alerts (Grid 2x)
Secțiunea de bază pentru monitorizarea amenințărilor, cu:
- Matricea de amenințări (Threat Matrix widget)
- Alerte sistem dinamice bazate pe condiții

##### Dynamic Alerts bazate pe conditions:
```typescript
{data?.live?.rateLimiting?.circuitBreakerState !== 'CLOSED' && (
  <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-red-400" />
      <span className="text-red-400 font-medium">Circuit Breaker Open</span>
    </div>
    <p className="text-sm text-gray-300 mt-1">
      System is throttling requests
    </p>
  </div>
)}

{(data?.live?.queue?.currentSize || 0) > 50 && (
  <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-yellow-400" />
      <span className="text-yellow-400 font-medium">High Queue Size</span>
    </div>
    <p className="text-sm text-gray-300 mt-1">
      {data?.live?.queue?.currentSize} requests queued
    </p>
  </div>
)}
```

### Animatii cu Framer Motion

Container pentru animații staggered:
```typescript
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.3 }
  }
};

export function ColumnLeft_RealTimeOps() {
  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={item}>
        <LiveActivityFeed />
      </motion.div>
      
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Circuit Breaker Status */}
        <motion.div variants={item}>
          {/* Component Circuit Breaker */}
        </motion.div>
        {/* ... */}
      </motion.div>
      
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <ThreatMatrix />
        </motion.div>
        {/* System Alerts */}
      </motion.div>
    </motion.div>
  );
}
```

### Best Practices UI/UX

#### Design Principles:
1. **Real-time Priority**: Toate datele se actualizează la fiecare 15 secunde
2. **Visual Hierarchy**: Stare critică -> Atenționare -> Normal
3. **Color Coding**: 
   - Green (✓): Normal, funcțional
   - Yellow (⚠): Atenționare, monitorizare
   - Red (✗): Critic, acțiune necesară
   - Blue (🔵): Informații, detalii

#### Performance Considerations:
- Staggered animations pentru a evî堵塞 GPU
- Debouncing la update-uri pentru a preveni flickering
- Lazy loading pentru widget-uri cu cost ridicat

#### Accessibility:
- Semantic HTML pentru screen readers
- Contrasturi suficiente între elemente
- Iconuri descriptive cu text alternativ

### Exemple de Utilizare

```typescript
// În contextul Mission Control
<MissionControlProvider>
  <ColumnLeft_RealTimeOps />
</MissionControlProvider>

// Cu styling custom
<ColumnLeft_RealTimeOps className="custom-realtime-ops" />
```

## Widgets Associated

### 1. LiveActivityFeed.tsx
Widget pentru afișarea feed-ului de activitate live:
- Lista ultimelor request-uri
- Status și response time
- Provider și model utilizat
- Filtre pentru succes/eroare

### 2. ThreatMatrix.tsx
Widget pentru monitorizarea rate limiting-ului:
- Progress bars pentru fiecare regulă
- Indicator de circuit breaker
- Alerte dinamice
- Acțiuni rapide (reset, detalii)

### Data Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Backend   │─→│ useMissionControl │─→│   Real Time Ops │
│                 │    │     Hook        │    │    Widget       │
│ - Live Data     │    │ - 15s interval  │    │ - Status Cards │
│ - Rate Limits   │    │ - Retry logic   │    │ - Activity Feed│
│ - Providers     │    │ - Error handling│    │ - Threat Matrix│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Concluzii

ColumnLeft_RealTimeOps este componenta esențială pentru monitoring-ul în timp real, oferind o imagine completă a sănătății sistemului cu:
- Actualizări frecvente la fiecare 15 secunde
- Status clar și vizual pentru toate componentele critice
- Alerte proactive pentru problemele sistemului
- Structură responsive care se adaptează la diferite dimensiuni de ecran

---

*Ultima actualizare: 2025-08-28*