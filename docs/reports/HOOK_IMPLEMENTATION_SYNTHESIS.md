# Sinteză Stare Hook-uri Dashboard

## 📋 Introducere
Acest document sintetizează starea curentă a hook-urilor React (`useCostOptimizer`, `usePerformanceAlerts`, `useProviderManager`) utilizate în dashboard, comparativ cu specificațiile detaliate din `WIDGET_TRANSFORM_PLAN.md`. Oferă o analiză a diferențelor, recomandări clare pentru aducerea hook-urilor în conformitate și o estimare a efortului necesar pentru finalizarea task-urilor.

---
## 1. Descrierea Stării Curente a Fiecărui Hook

### 1.1. `useCostOptimizer` (`ui/src/hooks/useCostOptimizer.ts`)
Acest hook este responsabil pentru preluarea datelor de optimizare a costurilor, generarea de recomandări și gestionarea acțiunilor asociate.
*   **Funcționalitate Curentă:**
    *   Preia date de cost de la endpoint-ul `/api/analytics/costs` (linia 52: `await fetch('/api/analytics/costs')`).
    *   Calculează `totalSavings`, `currentMonthlyCost`, `projectedMonthlyCost` pe baza unor estimări procentuale din `totalCost` primit de la API (liniile 63-65: `totalSavings: parseFloat(costData.summary.totalCost) * 0.2`).
    *   Generează recomandări *hardcodate* (liniile 66-90) cu economii estimate, nu pe baza unei analize dinamice a utilizării.
    *   Funcțiile `applyRecommendation` (liniile 123-151) și `dismissRecommendation` (liniile 153-174) actualizează *doar starea locală* a hook-ului, fără a interacționa cu un API backend pentru a persista sau aplica modificările.
    *   Include un mecanism intern de polling și retry.

### 1.2. `usePerformanceAlerts` (`ui/src/hooks/usePerformanceAlerts.ts`)
Acest hook gestionează preluarea și acțiunile legate de alerte de performanță.
*   **Funcționalitate Curentă:**
    *   Utilizează un hook generic `useApiPolling` pentru a prelua alerte de la endpoint-ul `/api/v1/mission-control/threat-matrix` (linia 26: `endpoint: '/api/v1/mission-control/threat-matrix'`).
    *   Combină stările de loading și error cu cele de la `useProviderManager` (liniile 32-36).
    *   Implementează funcții pentru `resolveAlert`, `resolveAllAlerts`, și `autoResolveAlert` (liniile 47-109) care fac apeluri `POST` către endpoint-ul `/api/v1/mission-control/resolve-alert` și reîmprospătează datele după succes.
    *   Datele alertelor (`PerformanceAlert`) sunt așteptate să includă `severity`, `title`, `description`, `action`, `impact` și `timestamp`.

### 1.3. `useProviderManager` (`ui/src/hooks/useProviderManager.ts`)
Acest hook este destinat gestionării stării și datelor providerilor, inclusiv a sănătății acestora.
*   **Funcționalitate Curentă:**
    *   Preia date de sănătate ale providerilor de la `missionControlAPI.getProviderHealth()` (linia 49: `const response = await missionControlAPI.getProviderHealth();`).
    *   Transformă răspunsul API într-un format `Provider[]` (liniile 55-63).
    *   **Bug Critic:** Variabilele `retryCountRef` și `isMountedRef` sunt declarate incorect cu `useState(0)[0]` și `useState(true)[0]` (liniile 32-33) în loc de `useRef()`, ceea ce duce la un comportament incorect al logicii de retry și al gestionării stării de montare/demontare a componentei.
    *   Logica de retry este incompletă, deoarece `retryCountRef` nu este incrementat (linia 77: `if (retryCountRef < retryCount)`).
    *   Nu expune funcții pentru a realiza acțiuni precum "Switch Provider" sau "Testează conexiunea".
    *   Câmpul `modelOverrides` din tipul `Provider` este populat cu o valoare statică `[]` (linia 62: `modelOverrides: []`).

---
## 2. Diferențe Majore dintre Implementarea Curentă și Specificațiile Cerute

### 2.1. `useCostOptimizer`
*   **Date Estimative vs. Reale:** Specificațiile din plan (`WIDGET_TRANSFORM_PLAN.md`, linii 135-139) cer economii și recomandări concrete ("Folosește claude-haiku în loc de gpt-4"), dar implementarea curentă folosește estimări procentuale și recomandări hardcodate.
*   **Lipsa Interacțiunii API pentru Acțiuni:** Planul (`WIDGET_TRANSFORM_PLAN.md`, linia 298) specifică un endpoint `POST /api/v1/cost/apply-optimization` pentru aplicarea optimizărilor, dar funcțiile `applyRecommendation` și `dismissRecommendation` (liniile 123-174) actualizează doar starea locală.
*   **Lipsa Detaliilor de Cost:** Nu există o funcționalitate explicită pentru "Cost breakdown pe rute și modele" în datele returnate de hook, așa cum este menționat în plan (`WIDGET_TRANSFORM_PLAN.md`, linia 142).
*   **Lipsa Acțiunii "Aplică toate":** Nu există o funcție corespondentă în hook pentru butonul "[Aplică toate]" menționat în plan (`WIDGET_TRANSFORM_PLAN.md`, linia 141).

### 2.2. `usePerformanceAlerts`
*   **Endpoint API Nealiniat:** Hook-ul utilizează `/api/v1/mission-control/threat-matrix` (linia 26) pentru a prelua alerte, în timp ce planul (`WIDGET_TRANSFORM_PLAN.md`, linia 299) menționează `GET '/api/v1/performance/alerts'` ca endpoint nou necesar. Similar, endpoint-ul de rezolvare (`/api/v1/mission-control/resolve-alert`, liniile 49, 70, 91) nu este aliniat cu cel din plan (`POST '/api/v1/performance/resolve-alert'`, linia 300). Este crucial să se verifice dacă endpoint-ul curent furnizează structura de date îmbunătățită (acțiuni, impact, severitate) conform specificațiilor.
*   **"Mă învață să rezolv":** Nu există o funcție dedicată în hook pentru a susține acțiunea "Mă învață să rezolv" (`WIDGET_TRANSFORM_PLAN.md`, linia 159), sugerând că aceasta ar putea fi o funcționalitate gestionată exclusiv la nivel de UI.

### 2.3. `useProviderManager`
*   **Eroare Critică `useRef`:** Utilizarea incorectă a `useState` în loc de `useRef` pentru `retryCountRef` și `isMountedRef` (liniile 32-33) este o eroare majoră care afectează fiabilitatea și comportamentul hook-ului, putând duce la re-render-uri inutile și la o logică de retry defectuoasă.
*   **Lipsa Funcționalităților de Control:** Hook-ul nu expune metode pentru "Switch Provider" sau "Testează conexiune", acțiuni cheie menționate în plan (`WIDGET_TRANSFORM_PLAN.md`, linii 197-198, 301-302).
*   **Logica de Retry Incompletă:** `retryCountRef` nu este incrementat în blocul `catch` (linia 77), ceea ce face ca logica de retry să nu funcționeze corect.
*   **Date `modelOverrides` Necompletate:** Câmpul `modelOverrides` din structura `Provider` nu este populat cu date reale din API, fiind setat static la `[]` (linia 62).

---
## 3. Recomandări Clare pentru Aducerea Hook-urilor în Conformitate cu Specificațiile

### 3.1. `useCostOptimizer`
1.  **Integrare API Reală pentru Date și Recomandări:**
    *   Modificați funcția `fetchData` (liniile 39-117) pentru a apela noul endpoint `GET /api/v1/cost/optimizations` (specificat la linia 297 a planului). Acest endpoint ar trebui să returneze date calculate real pentru `totalSavings`, `currentMonthlyCost`, `projectedMonthlyCost` și o listă dinamică de `recommendations` bazate pe logica backend.
    *   Eliminați logica de estimare procentuală și hardcodarea recomandărilor (liniile 63-90).
2.  **Implementare Acțiuni API pentru Aplicare/Anulare:**
    *   Actualizați funcțiile `applyRecommendation` (liniile 123-151) și `dismissRecommendation` (liniile 153-174) pentru a face apeluri `POST` către endpoint-ul `'/api/v1/cost/apply-optimization'` (specificat la linia 298), trimițând `id`-ul recomandării și, eventual, un flag de status. După un răspuns de succes, apelați `refetch()` pentru a actualiza datele.
3.  **Funcție "Aplică toate":**
    *   Adăugați o nouă funcție `applyAllRecommendations` la hook, care va itera prin recomandările `pending` și va apela endpoint-ul de aplicare pentru fiecare, sau un endpoint dedicat `apply-all` dacă backend-ul îl suportă.
4.  **Expunere Cost Breakdown:**
    *   Asigurați-vă că noul endpoint de optimizare a costurilor include datele pentru "Cost breakdown pe rute și modele" și expuneți-le prin obiectul `costData` returnat de hook.

### 3.2. `usePerformanceAlerts`
1.  **Aliniere Endpoint-uri API:**
    *   Verificați și actualizați `endpoint` în `useApiPolling` (linia 26) la `'/api/v1/performance/alerts'` (specificat la linia 299 a planului) dacă acesta este noul endpoint destinat.
    *   Aliniați endpoint-ul pentru `resolveAlert`, `resolveAllAlerts`, `autoResolveAlert` (liniile 49, 70, 91) la `'/api/v1/performance/resolve-alert'` (specificat la linia 300).
    *   Confirmați că noile endpoint-uri returnează structura `PerformanceAlert` cu `severity`, `action` și `impact` conform specificațiilor din plan.
2.  **Suport "Mă învață să rezolv":**
    *   Dacă această acțiune necesită date specifice din hook (ex: un link către documentație sau un ID pentru a deschide un modal cu instrucțiuni), adăugați-o la structura `PerformanceAlert` și expuneți-o. Altfel, este o responsabilitate a UI-ului.

### 3.3. `useProviderManager`
1.  **Corectarea `useRef` și Logicii de Retry:**
    *   Modificați `retryCountRef` și `isMountedRef` (liniile 32-33) pentru a folosi `useRef` în loc de `useState`:
        ```typescript
        const retryCountRef = useRef(0);
        const isMountedRef = useRef(true);
        ```
    *   Asigurați-vă că `isMountedRef.current` este setat la `false` în funcția de cleanup a `useEffect` (similar cu `useCostOptimizer`, liniile 195-199).
    *   Incrementați `retryCountRef.current` în blocul `catch` (linia 77) pentru a asigura o logică de retry funcțională.
2.  **Implementare Funcționalități de Control:**
    *   Adăugați o funcție `switchProvider(providerId: string)` care va efectua un apel `POST` către `'/api/v1/providers/switch'` (specificat la linia 302) și va reîmprospăta starea providerilor după succes.
    *   Adăugați o funcție `testConnection(providerId: string)` care va efectua un apel API către `'/api/v1/providers/health-check'` (specificat la linia 301) sau un endpoint similar, și va returna feedback.
    *   Expuneți aceste noi funcții în obiectul returnat de hook.
3.  **Populare `modelOverrides`:**
    *   Asigurați-vă că API-ul `missionControlAPI.getProviderHealth()` returnează date pentru `modelOverrides` și actualizați logica de transformare (liniile 55-63) pentru a le include corect în obiectul `Provider`.

---
## 4. Estimare Efort Total Necesar pentru Finalizarea Tuturor Task-urilor

Estimările de mai jos se referă strict la modificările din frontend (hook-uri) și presupun că endpoint-urile API necesare (conform secțiunii "API Endpoints Necesare" din plan, linii 291-304) sunt fie deja disponibile, fie vor fi implementate în paralel de echipa de backend.

*   **`useCostOptimizer`:**
    *   Integrare API reală pentru date și recomandări: 2 zile
    *   Implementare acțiuni API (`applyRecommendation`, `dismissRecommendation`): 1 zi
    *   Funcție `applyAllRecommendations` și expunere cost breakdown: 1 zi
    *   **Total estimat: 4 zile**

*   **`usePerformanceAlerts`:**
    *   Aliniere endpoint-uri API și verificare structură date: 1 zi
    *   Suport "Mă învață să rezolv" (dacă necesită logică în hook): 0.5 zile
    *   **Total estimat: 1.5 zile**

*   **`useProviderManager`:**
    *   Corectarea `useRef` și logicii de retry: 1 zi
    *   Implementare funcționalități `switchProvider`, `testConnection`: 1.5 zile
    *   Populare `modelOverrides`: 0.5 zile
    *   **Total estimat: 3 zile**

**Estimare Efort Total General pentru Toate Task-urile (Frontend Hook-uri):**
~ 4 + 1.5 + 3 = **8.5 zile de dezvoltare**

Această estimare nu include timpul pentru QA, revizuire cod, sau orice modificări necesare la nivel de UI/componente care ar folosi aceste hook-uri. De asemenea, dacă API-urile backend nu sunt pregătite, timpul de așteptare sau de dezvoltare a mock-urilor mai complexe ar putea crește efortul total.