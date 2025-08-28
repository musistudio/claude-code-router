# Dashboard Principal și Structură Generală

## Overview

Dashboard-ul principal serveste ca interfață centrală de control pentru Claude Code Router, oferind o vizualizare comprehensivă a sistemului, a modelelor AI, și a performanței în timp real. Implementat cu React și Framer Motion, dashboard-ul este modular, responsive și disponibil în română, engleză și chineză.

## Componenta Dashboard.tsx

### Descriere
Componenta principală a dashboard-ului, care orchestrează toate celelalte componente. Include sistemul de navigare prin tab-uri, controlul de limbaj, butoane de acțiune și layout-ul general al interfeței.

### Props

| Prop | Tip | Opțional | Descriere |
|------|-----|----------|-----------|
| className | string | Da | Clase CSS aditionale pentru containerul dashboard-ului |
| onOpenSettings | function | Da | Callback pentru deschiderea setărilor |
| onSaveConfig | function | Da | Callback pentru salvarea configurației |
| onSaveAndRestart | function | Da | Callback pentru salvare și restart |

### State Management
- `activeTab`: Stoca tab-ul curent activ (`'overview'`, `'mission-control'`, `'models'`, `'tracking'`, `'tools'`, `'system'`)
- `i18n`: Obiect pentru gestionarea limbajelor (react-i18next)

### Dependencies și Imports

```typescript
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import DASHBOARD_CONFIG from '@/config/dashboard';
import { OverviewTab } from './tabs/OverviewTab';
import { MissionControlTab } from './tabs/MissionControlTab';
import { ModelsTab } from './tabs/ModelsTab';
import { TrackingTab } from './tabs/TrackingTab';
import { ToolsTab } from './tabs/ToolsTab';
import { SystemTab } from './tabs/SystemTab';
import '@/styles/dashboard.css';
```

### Stiluri și CSS Classes

#### Clase principale:
- `dashboard-bg`: Fundal principal cu gradient dark theme
- `glass-card`: Card-uri cu efect de sticlă (transparente cu blur)
- `nav-tabs`: Container pentru navigarea prin tab-uri
- `nav-tab`: Buton individual de navigare
- `nav-tab.active`: Stil pentru tab-ul activ
- `fade-in`: Animatie pentru tranziția între tab-uri

#### Scheme de culori:
- **Primary**: Pink to violet gradient (`from-pink-500 to-violet-500`)
- **Success**: Green (`green-500/20`, `green-400`)
- **Danger**: Red (`red-500/20`, `red-400`)
- **Warning**: Yellow/Orange (`yellow-500/20`, `orange-500/20`)
- **Info**: Blue (`blue-500/20`, `blue-400`)

### Interacțiuni cu API

Dashboard-ul interacționează cu:
- `analyticsAPI.getRealtimeStats()`: Statistici în timp real
- `analyticsAPI.getModelStats()`: Statistici pentru modele
- `analyticsAPI.subscribeToRealtimeStats()`: Abonare la actualizări live
- `api.getConfig()`: Configurația curentă a sistemului

### Funcționalități Cheie

#### 1. Sistem de Navigare
- Tab-uri principale: Overview, Mission Control, Models, Tracking, Tools, System
- Tranziții fluide cu Framer Motion
- Highlight-ul vizual pentru tab-ul activ

#### 2. Selector de Limbă
- Suport pentru EN (Engleză), 中文 (Chineză)
- Starea permanentă a selecției
- Feedback vizual imediat

#### 3. Control Bar
- **Settings**: Iconă de configurare (cog)
- **Save**: Salvează configurația curentă
- **Save & Restart**: Salvează și repornește sistemul
- Toate butoanele have hover effects și transiții

#### 4. Responsive Design
- Layout fluid cu `max-w-7xl` și padding responsive
- Grid-uri adaptative (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Text scaling pe diferite ecrane

### Animatii și Tranzitii

#### Top Control Bar:
```typescript
initial={{ opacity: 0, y: -20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.6 }}
```

#### Header:
```typescript
initial={{ opacity: 0, y: -20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.6, delay: 0.1 }}
```

#### Navigation Tabs:
```typescript
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.6, delay: 0.2 }}
```

#### Tab Content:
```typescript
initial={{ opacity: 0, x: 20 }}
animate={{ opacity: 1, x: 0 }}
transition={{ duration: 0.4 }}
```

### Best Practices UI/UX

#### Design Principles:
1. **Consistency**: Scheme de culori și animații standardizate
2. **Hierarchy**: Titluri marcate clar cu gradient și dimensiuni variate
3. **Feedback**: Visual feedback pentru toate interacțiunile (hover, active, focus)
4. **Accessibility**: Contrasturi suficiente (4.5:1) și struct semantică
5. **Performance**: Animatii GPU-accelerate cu Framer Motion

#### Mobile Optimization:
- Touch-friendly targets (minim 48px)
- Responsive breakpoints (mobile, tablet, desktop)
- Vertical scrolling pe mobile, layout grid pe desktop

#### Dark Theme Guidelines:
- Background: `bg-gray-900` sau închis
- Text: `text-white` pentru prim-plan, `text-gray-400` pentru secundar
- Borders: `border-gray-700/50` cu efect de sticlă
- Cards: `bg-gray-800/50` cu blur și opacity

### Exemple de Utilizare

```typescript
<Dashboard
  className="custom-dashboard"
  onOpenSettings={handleOpenSettings}
  onSaveConfig={handleSaveConfig}
  onSaveAndRestart={handleSaveAndRestart}
/>
```

### Capturi de Ecran (Structură)

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code Router - Advanced Control Panel                 │
│ [EN] [中文] [Settings] [Save] [Save & Restart]               │
├─────────────────────────────────────────────────────────────┤
│ 🚀 Unified AI Proxy Control Center                          │
│ All-in-One Dashboard: Model Management, Real-time...        │
├─────────────────────────────────────────────────────────────┤
│ [●] Overview [○] Mission Control [○] Models [○] Tracking   │
│                                                                 
│  [Tab Content Area - Dynamic based on selection]           │
│                                                                 
└─────────────────────────────────────────────────────────────┘
```

## Configurație Dashboard

Fișierul de configurare `/src/config/dashboard.ts` definește:
- Tab-uri disponibile și ordinea lor
- Features activate/deactivate
- Proprietăți default pentru UI

### Exemplu Configurare:

```typescript
export const DASHBOARD_CONFIG = {
  enabled: true,
  defaultTab: 'overview',
  tabs: [
    { id: 'overview', label: 'Overview', icon: 'tachometer-alt' },
    { id: 'mission-control', label: 'Mission Control', icon: 'satellite-dish' },
    { id: 'models', label: 'Models', icon: 'microchip' },
    { id: 'tracking', label: 'Tracking', icon: 'chart-line' },
    { id: 'tools', label: 'Tools', icon: 'toolkit' },
    { id: 'system', label: 'System', icon: 'server' }
  ],
  features: {
    missionControl: true,
    realtimeStats: true,
    providerManagement: true
  }
};
```

## Concluzii

Dashboard-ul principal este bine structurat, modular și urmează principiile moderne de UI design. Cu o arhitectură flexibilă, design responsive și suport pentru multiple limbi, el oferă o experiență utilizator excelentă pentru managementul sistemului AI Proxy.

---

*Ultima actualizare: 2025-08-28*