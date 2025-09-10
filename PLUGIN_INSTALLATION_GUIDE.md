# Plugin Installation Guide / Ghid Instalare Plugin-uri

## 🇬🇧 English Version

### Prerequisites
- Node.js and npm installed
- Claude Code Router base installation

## Plugin System Architecture

The Claude Code Router supports a modular plugin system with two main plugins:
1. **Analytics Plugin** - Real-time monitoring and Mission Control dashboard
2. **Themes Plugin** - Advanced UI theming with glassmorphism effects

### Analytics Plugin Dependencies

#### Server-side Integration
**File:** `/src/index.ts`
```typescript
// Add after other plugin loading (around line 144)
if (pluginsConfig.analytics?.enabled) {
  const AnalyticsPlugin = require('../plugins/analytics').default;
  new AnalyticsPlugin().install(server.app, config);
  console.log('📊 Analytics Plugin loaded successfully');
}
```

#### Configuration File
**File:** `~/.claude-code-router/config.json`
```json
{
  "plugins": {
    "analytics": {
      "enabled": true,
      "batchSize": 25,
      "saveFrequency": 15000,
      "enableRealTimeUpdates": true,
      "dataRetentionDays": 30
    }
  }
}
```

#### Client-side Integration

**File:** `/ui/src/App.tsx`
```typescript
// Add lazy loading import (around line 16)
const MissionControlTab = React.lazy(() => 
  import('@plugins/analytics/ui/components/dashboard/tabs/MissionControlTab')
    .then(module => ({ default: module.MissionControlTab }))
    .catch(() => ({ default: () => <div>Analytics plugin not available</div> }))
);

// Add PluginProvider wrapper (around line 400)
<PluginProvider>
  {/* existing content */}
</PluginProvider>
```

**File:** `/ui/src/contexts/PluginContext.tsx` (create new file)
```typescript
// Full PluginContext implementation for plugin management
import React, { createContext, useContext, useState, useEffect } from 'react';
// ... (complete implementation as in current project)
```

**File:** `/ui/src/components/SettingsDialog.tsx`
```typescript
// Add plugin registration in useEffect
useEffect(() => {
  const registerPlugins = async () => {
    try {
      const { AnalyticsSettings } = await import('@plugins/analytics/ui/AnalyticsSettings');
      registerPlugin({
        id: 'analytics',
        name: 'Analytics',
        description: 'Real-time analytics and Mission Control dashboard',
        component: AnalyticsSettings,
        enabled: localStorage.getItem('analytics-enabled') === 'true'
      });
    } catch (error) {
      console.warn('Failed to register analytics plugin:', error);
    }
  };
  registerPlugins();
}, [registerPlugin]);
```

### Themes Plugin Dependencies

#### Server-side Integration
**File:** `/src/index.ts`
```typescript
// Add after analytics plugin loading (around line 149)
if (pluginsConfig.themes?.enabled) {
  const ThemesPlugin = require('../plugins/themes').default;
  ThemesPlugin.register();
  console.log('🎨 Themes Plugin loaded successfully');
}
```

#### Configuration File
**File:** `~/.claude-code-router/config.json`
```json
{
  "plugins": {
    "themes": {
      "enabled": true,
      "activeTheme": "dark",
      "availableThemes": [
        "light",
        "dark", 
        "advanced"
      ],
      "persistUserChoice": true,
      "autoApplySystemTheme": false
    }
  }
}
```

#### Layout Transformer Integration
**File:** `/plugins/themes/scripts/layout-transformer.js`
```javascript
// This file contains advanced layout transformations
// It integrates with analytics plugin for tab navigation:
const analyticsTab = this.createNavigationTab('Analytics', 'analytics', false);

// Shows analytics content when theme is advanced
showAnalyticsContent() {
  if (window.__PLUGIN_UI_REGISTRY__?.components?.analytics) {
    console.log('📊 Loading Analytics content...');
  }
}
```

#### Client-side Integration

**File:** `/ui/src/main.tsx`
```typescript
// Add CSS import (line 5)
import '../../plugins/themes/styles/themes.css'

// Add ThemeProvider import (line 9)
import { ThemeProvider } from '../../plugins/themes/contexts/ThemeContext';

// Wrap app with ThemeProvider
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </ConfigProvider>
  </StrictMode>,
)
```

**File:** `/ui/src/components/SettingsDialog.tsx`
```typescript
// Add themes plugin registration in useEffect
const { ThemeSettings } = await import('@plugins/themes/ui/ThemeSettings');
registerPlugin({
  id: 'themes',
  name: 'Advanced Themes',
  description: 'Glassmorphism effects and premium theming',
  component: ThemeSettings,
  enabled: localStorage.getItem('themes-enabled') === 'true'
});
```

**File:** `/ui/src/types.ts`
```typescript
// Add to PluginsConfig interface (around line 61)
export interface PluginsConfig {
  themes?: {
    enabled: boolean;
    activeTheme: 'light' | 'dark' | 'advanced';
    availableThemes: ('light' | 'dark' | 'advanced')[];
    persistUserChoice?: boolean;
    autoApplySystemTheme?: boolean;
  };
}
```

### Build System Configuration

**File:** `/ui/vite.config.ts`
```typescript
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@plugins": path.resolve(__dirname, "../plugins"), // Add this line
    },
  },
  build: {
    rollupOptions: {
      external: [],
    }
  }
})
```

**File:** `/ui/tsconfig.json`
```jsonc
{
  "compilerOptions": {
    // ... existing config
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@plugins/*": ["../plugins/*"] // Add this line
    }
  },
  "include": ["src", "../plugins/**/*"], // Add ../plugins/**/*
  "exclude": []
}
```

### Dependencies Installation

**Dependencies needed in `/ui/package.json`:**
```json
{
  "dependencies": {
    "framer-motion": "^12.23.12",
    "recharts": "^3.1.2",
    "@types/recharts": "^1.8.29"
  }
}
```

### Symbolic Link Setup
```bash
# Create symbolic link for node_modules sharing
cd /path/to/claude-code-router/plugins
ln -sf ../ui/node_modules node_modules
```

### Cross-Plugin Dependencies & Additional References

#### Theme Plugin References to Analytics
**File:** `/plugins/themes/scripts/layout-transformer.js`
- Creates analytics navigation tabs
- Shows/hides analytics content based on plugin availability
- Requires analytics plugin for full functionality

#### Types & Interfaces
**File:** `/ui/src/types.ts`
```typescript
// StatusLine types (not related to themes plugin)
export interface StatusLineThemeConfig {
  modules: StatusLineModuleConfig[];
}

// Plugin configuration types
export interface PluginsConfig {
  themes?: {
    enabled: boolean;
    activeTheme: 'light' | 'dark' | 'advanced';
    availableThemes: ('light' | 'dark' | 'advanced')[];
    persistUserChoice?: boolean;
    autoApplySystemTheme?: boolean;
  };
}
```

#### Window Global Objects
Both plugins extend the global window object:
```typescript
// In plugins/themes/types/index.ts
declare global {
  interface Window {
    __THEMES_PLUGIN__?: ThemePluginAPI;
    LayoutTransformer?: any;
  }
}

// In plugins/analytics (runtime)
window.__PLUGIN_UI_REGISTRY__?.components?.analytics
```

### Installation Steps

1. **Clone/Copy Plugin Directories**
   ```bash
   # Ensure these directories exist:
   plugins/analytics/
   plugins/themes/
   ```

2. **Install Dependencies**
   ```bash
   cd ui
   npm install framer-motion recharts @types/recharts
   ```

3. **Create Symbolic Link**
   ```bash
   cd ../plugins
   ln -sf ../ui/node_modules node_modules
   ```

4. **Apply Code Changes**
   - Follow the code snippets above for each file
   - Ensure all imports and configurations are in place

5. **Build and Test**
   ```bash
   cd ui
   npm run build
   ```

---

## 🇷🇴 Versiunea Română

### Cerințe Preliminare
- Node.js și npm instalate
- Instalarea de bază a Claude Code Router

## Arhitectura Sistemului de Plugin-uri

Claude Code Router suportă un sistem modular de plugin-uri cu două plugin-uri principale:
1. **Plugin Analytics** - Monitorizare în timp real și dashboard Mission Control
2. **Plugin Themes** - Tematizare avansată UI cu efecte glassmorphism

### Dependențe Plugin Analytics

#### Integrare Server-side
**Fișier:** `/src/index.ts`
```typescript
// Adaugă după încărcarea altor plugin-uri (în jurul liniei 144)
if (pluginsConfig.analytics?.enabled) {
  const AnalyticsPlugin = require('../plugins/analytics').default;
  new AnalyticsPlugin().install(server.app, config);
  console.log('📊 Analytics Plugin loaded successfully');
}
```

#### Fișier de Configurație
**Fișier:** `~/.claude-code-router/config.json`
```json
{
  "plugins": {
    "analytics": {
      "enabled": true,
      "batchSize": 25,
      "saveFrequency": 15000,
      "enableRealTimeUpdates": true,
      "dataRetentionDays": 30
    }
  }
}
```

#### Integrare Client-side

**Fișier:** `/ui/src/App.tsx`
```typescript
// Adaugă import lazy loading (în jurul liniei 16)
const MissionControlTab = React.lazy(() => 
  import('@plugins/analytics/ui/components/dashboard/tabs/MissionControlTab')
    .then(module => ({ default: module.MissionControlTab }))
    .catch(() => ({ default: () => <div>Analytics plugin not available</div> }))
);

// Adaugă wrapper PluginProvider (în jurul liniei 400)
<PluginProvider>
  {/* conținut existent */}
</PluginProvider>
```

**Fișier:** `/ui/src/contexts/PluginContext.tsx` (creează fișier nou)
```typescript
// Implementare completă PluginContext pentru managementul plugin-urilor
import React, { createContext, useContext, useState, useEffect } from 'react';
// ... (implementare completă ca în proiectul curent)
```

**Fișier:** `/ui/src/components/SettingsDialog.tsx`
```typescript
// Adaugă înregistrarea plugin-ului în useEffect
useEffect(() => {
  const registerPlugins = async () => {
    try {
      const { AnalyticsSettings } = await import('@plugins/analytics/ui/AnalyticsSettings');
      registerPlugin({
        id: 'analytics',
        name: 'Analytics',
        description: 'Real-time analytics and Mission Control dashboard',
        component: AnalyticsSettings,
        enabled: localStorage.getItem('analytics-enabled') === 'true'
      });
    } catch (error) {
      console.warn('Failed to register analytics plugin:', error);
    }
  };
  registerPlugins();
}, [registerPlugin]);
```

### Dependențe Plugin Themes

#### Integrare Server-side
**Fișier:** `/src/index.ts`
```typescript
// Adaugă după încărcarea plugin-ului analytics (în jurul liniei 149)
if (pluginsConfig.themes?.enabled) {
  const ThemesPlugin = require('../plugins/themes').default;
  ThemesPlugin.register();
  console.log('🎨 Themes Plugin loaded successfully');
}
```

#### Fișier de Configurație
**Fișier:** `~/.claude-code-router/config.json`
```json
{
  "plugins": {
    "themes": {
      "enabled": true,
      "activeTheme": "dark",
      "availableThemes": [
        "light",
        "dark",
        "advanced"
      ],
      "persistUserChoice": true,
      "autoApplySystemTheme": false
    }
  }
}
```

#### Integrare Layout Transformer
**Fișier:** `/plugins/themes/scripts/layout-transformer.js`
```javascript
// Acest fișier conține transformări avansate de layout
// Se integrează cu plugin-ul analytics pentru navigare tab-uri:
const analyticsTab = this.createNavigationTab('Analytics', 'analytics', false);

// Afișează conținut analytics când tema este advanced
showAnalyticsContent() {
  if (window.__PLUGIN_UI_REGISTRY__?.components?.analytics) {
    console.log('📊 Loading Analytics content...');
  }
}
```

#### Integrare Client-side

**Fișier:** `/ui/src/main.tsx`
```typescript
// Adaugă import CSS (linia 5)
import '../../plugins/themes/styles/themes.css'

// Adaugă import ThemeProvider (linia 9)
import { ThemeProvider } from '../../plugins/themes/contexts/ThemeContext';

// Învelește app-ul cu ThemeProvider
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </ConfigProvider>
  </StrictMode>,
)
```

**Fișier:** `/ui/src/components/SettingsDialog.tsx`
```typescript
// Adaugă înregistrarea plugin-ului themes în useEffect
const { ThemeSettings } = await import('@plugins/themes/ui/ThemeSettings');
registerPlugin({
  id: 'themes',
  name: 'Advanced Themes',
  description: 'Glassmorphism effects and premium theming',
  component: ThemeSettings,
  enabled: localStorage.getItem('themes-enabled') === 'true'
});
```

**Fișier:** `/ui/src/types.ts`
```typescript
// Adaugă la interfața PluginsConfig (în jurul liniei 61)
export interface PluginsConfig {
  themes?: {
    enabled: boolean;
    activeTheme: 'light' | 'dark' | 'advanced';
    availableThemes: ('light' | 'dark' | 'advanced')[];
    persistUserChoice?: boolean;
    autoApplySystemTheme?: boolean;
  };
}
```

### Configurare Build System

**Fișier:** `/ui/vite.config.ts`
```typescript
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@plugins": path.resolve(__dirname, "../plugins"), // Adaugă această linie
    },
  },
  build: {
    rollupOptions: {
      external: [],
    }
  }
})
```

**Fișier:** `/ui/tsconfig.json`
```jsonc
{
  "compilerOptions": {
    // ... config existent
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@plugins/*": ["../plugins/*"] // Adaugă această linie
    }
  },
  "include": ["src", "../plugins/**/*"], // Adaugă ../plugins/**/*
  "exclude": []
}
```

### Instalare Dependențe

**Dependențe necesare în `/ui/package.json`:**
```json
{
  "dependencies": {
    "framer-motion": "^12.23.12",
    "recharts": "^3.1.2",
    "@types/recharts": "^1.8.29"
  }
}
```

### Configurare Link Simbolic
```bash
# Creează link simbolic pentru partajarea node_modules
cd /path/to/claude-code-router/plugins
ln -sf ../ui/node_modules node_modules
```

### Dependențe Cross-Plugin și Referințe Adiționale

#### Referințe Plugin Themes către Analytics
**Fișier:** `/plugins/themes/scripts/layout-transformer.js`
- Creează tab-uri de navigare pentru analytics
- Afișează/ascunde conținut analytics bazat pe disponibilitatea plugin-ului
- Necesită plugin-ul analytics pentru funcționalitate completă

#### Tipuri și Interfețe
**Fișier:** `/ui/src/types.ts`
```typescript
// Tipuri StatusLine (nu sunt legate de plugin-ul themes)
export interface StatusLineThemeConfig {
  modules: StatusLineModuleConfig[];
}

// Tipuri configurație plugin-uri
export interface PluginsConfig {
  themes?: {
    enabled: boolean;
    activeTheme: 'light' | 'dark' | 'advanced';
    availableThemes: ('light' | 'dark' | 'advanced')[];
    persistUserChoice?: boolean;
    autoApplySystemTheme?: boolean;
  };
}
```

#### Obiecte Globale Window
Ambele plugin-uri extind obiectul global window:
```typescript
// În plugins/themes/types/index.ts
declare global {
  interface Window {
    __THEMES_PLUGIN__?: ThemePluginAPI;
    LayoutTransformer?: any;
  }
}

// În plugins/analytics (runtime)
window.__PLUGIN_UI_REGISTRY__?.components?.analytics
```

### Pași de Instalare

1. **Clonează/Copiază Directoarele Plugin-urilor**
   ```bash
   # Asigură-te că aceste directoare există:
   plugins/analytics/
   plugins/themes/
   ```

2. **Instalează Dependențele**
   ```bash
   cd ui
   npm install framer-motion recharts @types/recharts
   ```

3. **Creează Link Simbolic**
   ```bash
   cd ../plugins
   ln -sf ../ui/node_modules node_modules
   ```

4. **Aplică Modificările de Cod**
   - Urmează fragmentele de cod de mai sus pentru fiecare fișier
   - Asigură-te că toate import-urile și configurațiile sunt în place

5. **Build și Test**
   ```bash
   cd ui
   npm run build
   ```

### Verificare Funcționalitate

Pentru a verifica că plugin-urile funcționează:

1. **Analytics Plugin:**
   - Verifică că butonul Analytics apare în header
   - Tab-ul Mission Control se încarcă în mod Lazy
   - Setările Analytics apar în Settings Dialog

2. **Themes Plugin:**
   - Teme disponibile în Settings Dialog
   - Efecte glassmorphism când tema advanced este activă
   - Persistența temelor în localStorage

### Troubleshooting Comun

**Eroare: "Cannot find module '@plugins/..."**
- Verifică configurarea alias-urilor în vite.config.ts și tsconfig.json
- Asigură-te că link-ul simbolic node_modules există

**Plugin-urile nu apar în Settings Dialog:**
- Verifică că înregistrarea plugin-urilor se face în useEffect
- Controlează console-ul pentru erori de import

**Build eșuează:**
- Verifică că toate dependențele sunt instalate
- Asigură-te că include-ul din tsconfig.json conține "../plugins/**/*"
