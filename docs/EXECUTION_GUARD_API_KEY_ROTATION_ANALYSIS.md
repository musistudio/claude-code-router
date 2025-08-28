# ExecutionGuard API Key Rotation Extension - Analiza Tehnica si Plan de Implementare

## Context General

ExecutionGuard este deja "poarta de intrare" pentru toate cererile API in Claude Code Router, gestionand rate limiting, retry logic, circuit breaker si queue management. Extinderea acestuia pentru a include rotirea cheilor API este o evolutie naturala care va transforma componenta dintr-un simplu "controlor de trafic" intr-un **manager complet de acces si rezilienta API**.

## Analiza Situatiei Actuale

### 🔍 Structura Curenta ExecutionGuard

**Locatie**: `/src/utils/ExecutionGuard.ts`
**Functii principale**:
- Rate limiting (burst, perMinute, perHour, perDay)
- Circuit breaker pattern 
- Request queuing cu minDelayMs
- Retry logic cu exponential backoff
- Request deduplication
- Provider health tracking

**Entry Point Principal**:
```typescript
export async function guardedExecute<T>(
  requestFn: () => Promise<T>,
  context?: {
    req?: any;
    keyId?: string;                    // ✅ Deja exista (nefolosit)
    providerName?: string | (() => string); // ✅ Deja exista 
    skipDeduplication?: boolean;
    skipQueue?: boolean;
  }
): Promise<T>
```

**Observatii importante**:
- ✅ `keyId` parameter deja exista dar nu e folosit
- ✅ `providerName` exista si poate fi functie sau string
- ✅ Structura este pregatita pentru extensii
- ✅ Singleton pattern: `export const executionGuard = new ExecutionGuard()`

### 🎯 Cazul de Folosire: Google Gemini API Keys

**Problema actuala**: 
- Claude Code Router foloseste o singura cheie API pentru Gemini (`GOOGLE_API_KEY`)
- La volumul mare de cereri, se ajunge rapid la limitele de rate (QPS, RPM, RPD)
- Rate limiting-ul intern nu rezolva complet problema - cheile multiple permit throughput mai mare

**Solutia propusa**:
- Rotirea cheilor API doar pentru providerii care contin modele "gemini"  
- Strategie round-robin pentru distributia cererilor
- Izolare completa - alti provideri (Anthropic, OpenAI) nu sunt afectati
- Configurare flexibila prin environment variables

## Analiza Tehnica Detaliata

### 🔧 Modificari Necesare in ExecutionGuardConfig

```typescript
export interface ExecutionGuardConfig {
  // ... configuratiile existente ...
  
  // NOU: Key Management System
  keyManagement: {
    enabled: boolean;
    providers: {
      [providerPattern: string]: {
        keys: (string | undefined)[];  // Array de chei API
        strategy: 'round-robin' | 'random' | 'weighted';
        healthCheck?: {
          enabled: boolean;
          intervalMs: number;
          timeoutMs: number;
        };
        fallbackBehavior: 'fail' | 'useFirst' | 'useEnvironment';
      };
    };
  };
}
```

### 🔄 Logica de Rotare

**1. Key Selection Algorithm**:
```typescript
private currentKeyIndex: Map<string, number> = new Map();

private selectApiKey(providerName: string): string | undefined {
  const config = this.findProviderConfig(providerName);
  if (!config) return undefined;
  
  const validKeys = config.keys.filter(key => key && key.trim() !== '');
  if (validKeys.length === 0) return undefined;
  
  switch (config.strategy) {
    case 'round-robin':
      return this.roundRobinSelection(providerName, validKeys);
    case 'random':
      return validKeys[Math.floor(Math.random() * validKeys.length)];
    default:
      return validKeys[0];
  }
}
```

**2. Provider Pattern Matching**:
```typescript
private findProviderConfig(providerName: string): KeyProviderConfig | undefined {
  const providers = this.config.keyManagement?.providers || {};
  
  // Cautare exacta
  if (providers[providerName]) return providers[providerName];
  
  // Cautare prin pattern matching
  for (const [pattern, config] of Object.entries(providers)) {
    if (providerName.toLowerCase().includes(pattern.toLowerCase())) {
      return config;
    }
  }
  
  return undefined;
}
```

### 🔐 Integration Points

**1. Modificarea semnaturii requestFn**:
```typescript
// ACTUAL:
requestFn: () => Promise<T>

// PROPUS:
requestFn: (context: { apiKey?: string }) => Promise<T>
```

**2. Conditional Key Injection**:
```typescript
async execute<T>(
  requestFn: (context: { apiKey?: string }) => Promise<T>,
  context: ExecuteContext = {}
): Promise<T> {
  const { providerName: providerNameOrFn } = context;
  const actualProviderName = typeof providerNameOrFn === 'function' ? providerNameOrFn() : providerNameOrFn;

  let selectedApiKey: string | undefined;
  
  // ✅ CONDITIONAL ACTIVATION - doar pentru Gemini
  if (actualProviderName && this.shouldUseKeyRotation(actualProviderName)) {
    selectedApiKey = this.selectApiKey(actualProviderName);
  }

  const guardedRequestFn = () => requestFn({ apiKey: selectedApiKey });
  
  // Continuare cu logica existenta...
  if (this.config.queue.enabled && !context.skipQueue) {
    return this.enqueue(guardedRequestFn, { req: context.req, providerName: actualProviderName });
  } else {
    return this.executeWithRetry(guardedRequestFn, context.req, actualProviderName);
  }
}

private shouldUseKeyRotation(providerName: string): boolean {
  if (!this.config.keyManagement?.enabled) return false;
  return !!this.findProviderConfig(providerName);
}
```

### 📊 Impact Analysis

**Provideri afectati**: Doar cei configurati explicit (ex: "google-gemini", "gemini")
**Provideri NEAFECTATI**: Anthropic, OpenAI, alti provideri 
**Compatibilitate**: 100% backward compatible
**Performance impact**: Minimal (O(1) key selection, Map lookups)

## Plan de Implementare Prioritizat

### 🚨 FASE 1: Core Implementation (8-12 ore)

#### Task 1.1: Extindere Interface & Config (2-3 ore)
- ✅ Adaugare `keyManagement` la `ExecutionGuardConfig`
- ✅ Definire tipuri pentru `KeyProviderConfig` 
- ✅ Validare configuratie la instantiere
- ✅ Tests pentru noile interfete

#### Task 1.2: Key Selection Engine (3-4 ore) 
- ✅ Implementare `selectApiKey()` cu round-robin
- ✅ Implementare `findProviderConfig()` cu pattern matching
- ✅ State management pentru `currentKeyIndex` 
- ✅ Fallback behavior pentru edge cases

#### Task 1.3: Integration in execute() Method (2-3 ore)
- ✅ Modificare semnatura `requestFn` pentru context injection  
- ✅ Conditional key injection logic
- ✅ Adaptare `enqueue()` si `executeWithRetry()` pentru noua semnatura
- ✅ Propagare context prin toda chain-ul de apeluri

#### Task 1.4: Configuration Loading (1-2 ore)
- ✅ Environment variables parsing pentru chei multiple
- ✅ Support pentru `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, etc.
- ✅ Configuration validation si error handling
- ✅ Default fallback la cheile existente

### 🔶 FASE 2: Integration & Testing (4-6 ore)

#### Task 2.1: Provider Integration (2-3 ore)
- ✅ Modificare apelurilor Gemini pentru a folosi `execContext.apiKey`
- ✅ Identificare si updatare a tuturor `guardedExecute()` calls pentru Gemini
- ✅ Backward compatibility testing cu providerii neafectati
- ✅ Error handling pentru missing/invalid keys

#### Task 2.2: Comprehensive Testing (2-3 ore)
- ✅ Unit tests pentru key rotation logic
- ✅ Integration tests cu multi-key setup
- ✅ Load testing pentru verificarea distributiei uniforme
- ✅ Regression testing pentru providerii existenti

### 🔵 FASE 3: Monitoring & Optimization (3-4 ore)

#### Task 3.1: Enhanced Analytics (1-2 ore)
- ✅ Key usage tracking per provider
- ✅ Rate limit monitoring per key
- ✅ Success/failure rates per key
- ✅ Dashboard integration pentru key health

#### Task 3.2: Health Checking (1-2 ore)
- ✅ Periodic key validation (optional)
- ✅ Automatic key disabling pentru 403/401 errors
- ✅ Circuit breaker integration per key
- ✅ Recovery mechanism pentru failed keys

#### Task 3.3: UI Integration (1 ora)
- ✅ ExecutionGuardFineTuning widget extensie
- ✅ Key rotation status indicators
- ✅ Per-key usage statistics display
- ✅ Manual key testing capabilities

## Avantaje Strategice

### 🎯 Beneficii Imediate
1. **Throughput crescut**: 3-5x mai multe cereri simultane pentru Gemini
2. **Rezilienta**: Redundanta in caz de key failures/rate limits
3. **Cost optimization**: Distributie uniforma evita quota wastage
4. **Zero downtime**: Failover automat intre chei

### 🔒 Beneficii de Siguranta
1. **Izolare completa**: Doar Gemini afectat, zero risc pentru alti provideri
2. **Graceful degradation**: Fallback la cheia principala daca rotation fails
3. **Audit trail**: Tracking complet al folosirii cheilor
4. **Configuration validation**: Preventie erori de configurare

### 📈 Beneficii Arhitecturale
1. **Single Responsibility**: ExecutionGuard devine single point pentru API access
2. **Extensibilitate**: Framework poate fi extins la alti provideri 
3. **Observability**: Centralized monitoring pentru toate accesele API
4. **Maintainability**: Logica centralizata, nu duplicata prin cod

## Riscuri si Mitigari

### ⚠️ Riscuri Identificate
1. **Key quota exhaustion**: Toate cheile ajung la limite simultan
2. **Configuration errors**: Chei invalide sau duplicate
3. **Performance overhead**: Overhead minimal pentru selection logic
4. **Backwards compatibility**: Schimbarea semnaturii `requestFn`

### 🛡️ Strategii de Mitigare
1. **Quota monitoring**: Tracking centralizat si alerting
2. **Validation stricta**: Config validation la startup cu detailed errors
3. **Benchmarking**: Performance tests pentru a confirma overhead minimal
4. **Gradual migration**: Coexistenta temporara a ambelor semnături

## Configuratie Exemplu

```typescript
// Environment Variables
GOOGLE_API_KEY_1=AIzaSyA...1
GOOGLE_API_KEY_2=AIzaSyA...2  
GOOGLE_API_KEY_3=AIzaSyA...3
GOOGLE_API_KEY_4=AIzaSyA...4

// ExecutionGuard Configuration
const guardConfig = {
  // ... existing config ...
  keyManagement: {
    enabled: true,
    providers: {
      'google-gemini': {
        keys: [
          process.env.GOOGLE_API_KEY_1,
          process.env.GOOGLE_API_KEY_2,
          process.env.GOOGLE_API_KEY_3,
          process.env.GOOGLE_API_KEY_4,
        ].filter(Boolean), // Remove undefined values
        strategy: 'round-robin',
        fallbackBehavior: 'useEnvironment' // Fallback la GOOGLE_API_KEY daca rotation fails
      }
    }
  }
};
```

## Next Steps

### 🎯 Immediate Actions
1. **Review tehnic** al acestei analize cu team-ul
2. **Prioritizare** task-urilor in functie de business needs  
3. **Environment setup** pentru testare cu chei multiple
4. **Spike development** pentru Task 1.1 (2-4 ore)

### 📅 Timeline Estimat
- **Fase 1** (Core): 1-2 saptamani dezvoltare
- **Fase 2** (Integration): 3-5 zile testing
- **Fase 3** (Polish): 2-3 zile monitoring/UI
- **Total**: 2-3 saptamani pentru implementare completa

**Prioritatea #1**: Aceasta functionalitate ar trebui sa fie urmatoarea mare extensie dupa completarea widget-urilor critice, deoarece adreseaza direct problemele de scalabilitate si rezilienta ale sistemului.