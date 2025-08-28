# 🏗️ Arhitectura Sistemului - Claude Code Router

## Overview General

Claude Code Router este un proxy inteligent care rutează cererile de la Claude Code către diferite provideri AI și modele. Sistemul proiectat pentru flexibilitate, extensibilitate și performanță.

## Componente Principale

### 1. Core Router (`src/utils/router.ts`)
- **Responsabilitate**: Logica principală de rutare a cererilor
- **Features**:
  - Rutare bazată pe scenarii (default, background, think, longContext, webSearch)
  - Suport pentru provider multiplu
  - Dynamic model switching
  - Custom router support

### 2. Server HTTP (`src/server.ts`)
- **Tehnologie**: Fastify
- **Port**: 3456 (default)
- **Features**:
  - Proxy pentru cereri către provideri externi
  - Middleware de autentificare
  - API endpoints pentru Mission Control și Analytics
  - Static file serving pentru UI

### 3. Sistem de Transformare (`src/transformers/`)
- **Responsabilitate**: Adaptarea cererilor/răspunsurilor pentru diferiți provideri
- **Transformeri disponibili**:
  - Anthropic, DeepSeek, Gemini, OpenRouter
  - Maxtoken, Tooluse, Reasoning
  - Custom transformers încărcați din fișiere

### 4. Engine de Analytics (`src/utils/analytics.ts`)
- **Features**:
  - Tracking utilizare modele și provideri
  - Calcul performanță (latency, success rate)
  - istoric cereri și erori
  - Agregare date pentru Mission Control

### 5. Execution Guard (`src/utils/ExecutionGuard.ts`)
- **Responsabilitate**: Monitorizare și protecție sistem
- **Features**:
  - Rate limiting
  - Timeout handling
  - Request deduplication
  - Provider fallback

### 6. UI Dashboard (`ui/`)
- **Tehnologie**: React + TypeScript + Vite
- **Features**:
  - Dashboard real-time cu 3 coloane
  - Widget-uri pentru monitorizare
  - Management provideri
  - Configurare și logging

## Arhitectură Componentelor

```mermaid
graph TD
    A[Claude Code Client] -->|HTTP Request| B[Router Server @ 3456]
    B --> C[Authentication Middleware]
    C --> D[Request Router]
    
    D --> E[Route Logic]
    E --> F[Select Provider & Model]
    
    F --> G[Transformer]
    G --> H[Provider API]
    H --> I[Response Processing]
    I --> J[Analytics Tracking]
    J --> K[Response to Client]
    
    L[Mission Control UI] -->|WebSocket/HTTP| B
    M[Analytics UI] -->|HTTP| B
    
    N[Execution Guard] -->|Monitor| D
    O[Logging System] -->|Log| All Components
```

## Flux de Execuție

### 1. Request Processing
```typescript
1. Primesc request de la Claude Code
2. Autentificare (dacă există APIKEY)
3. Analizează request pentru rutare
4. Selectează provider/model din config
5. Aplă transformers (dacă există)
6. Trimite la provider
7. Procesează răspuns
8. Trackează în analytics
9. Returnează către client
```

### 2. Rutare Logică
```typescript
- Dacă există route în request → folosește specific route
- Dacă există subagent model → folosește model specificat
- Altfel → folosește rutare din config.json
  - background: mici modele locale
  - think: modele reasoning
  - longContext: modele cu context lung
  - default: rutare standard
```

### 3. Error Handling
- Rate limiting: 100 request pe minut per client
- Timeout: 60000ms (configurabil)
- Fallback la provider alternativ dacă e disponibil
- Logging detaliat pentru depanare

## Performance Optimizations

1. **Caching**: Session caching pentru utilizare
2. **Deduplication**: Eliminare duplicate cereri
3. **Connection Pooling**: Reutilizare conexiuni HTTP
4. **Async Processing**: Operații non-blocante

## Securitate

1. **Authentication**: API key optional per request
2. **Input Validation**: Validare request JSON
3. **Rate Limiting**: Protejare contra abuse
4. **HTTPS Support**: Prin proxy URL

## Scalabilitate

1. **Horizontal Scaling**: Poate rula în multiple instanțe
2. **Load Balancing**: Suport pentru round-robin
3. **Configuration Hot Reload**: Config live updates fără restart
4. **Resource Monitoring**: Track resource usage

## Plugins și Extensibilitate

1. **Custom Transformers**: Încărcare din fișiere JS
2. **Custom Router**: Funcții JavaScript personalizate
3. **Middleware**: Adăugare middleware custom
4. **UI Components**: Extindere interfață utilizator

## Monitoring și Observabilitate

1. **Logging**: Pino logging cu rotire fișiere
2. **Metrics**: Prometheus-compatible metrics
3. **UI Dashboard**: Real-time monitoring
4. **Health Checks**: Endpoint-uri de health check