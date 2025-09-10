 am incercat sa lucrez la componenta @src/utils/ExecutionGuard.ts care ar trebui   │
│    sa Claude code router sa fie încetinit in timpul în care emite requests? Am       │
│    incercat sa creez un queue in care sa pun requesturile și să le eliberez treptat  │
│    dar văd că învelirea acelui fetch nu mă ajută în mod real ca requesturile sa nu   │
│    fie trimise repede. Deși am setat un delay de o secundă pentru a proteja de       │
│    erorile 429 ale modelelor gemini, dar solicitarile vad ca nu trec toate prin      │
│    acest modul, a plasa ExecutionGuard într-un hook preHandler al serverului         │
│    Fastify. Aceasta este, teoretic, cea mai bună abordare, deoarece interceptează    │
│    cererile la un nivel foarte înalt.                                                │
│    Totuși, log-ul dumneavoastră arată în continuare cereri succesive la intervale de │
│     ~1 secundă, care duc la erori:                                                   │
│    20:29:44 ... error                                                                │
│    20:29:41 ... error                                                                │
│    20:29:39 ... error                                                                │
│    Faptul că intervalul este atât de scurt și că duc la erori (probabil 429)         │
│    sugerează că sistemul de reîncercare (retry) al ExecutionGuard intră în acțiune,  │
│    dar coada (queue) nu este la fel de eficientă cum ne-am aștepta.                  │
│    Problema este următoarea:                                                         │
│    executionGuard.execute este proiectat să învelească funcția care face efectiv     │
│    cererea fetch, nu doar funcția de rutare.                                         │
│    În configurația actuală, dumneavoastră protejați cu executionGuard doar logica de │
│     rutare, adică funcția router. Să urmărim fluxul:                                 │
│    O cerere către /v1/messages sosește.                                              │
│    Hook-ul preHandler este activat.                                                  │
│    executionGuard este apelat. El pune funcția router în coadă.                      │
│    După ce așteaptă minDelayMs, executionGuard execută funcția router.               │
│    Funcția router modifică req.body.model și se termină. Promisiunea din             │
│    executionGuard.execute se rezolvă cu succes.                                      │
│    Hook-ul preHandler se termină.                                                    │
│    Fastify trece controlul la handler-ul principal al rutei /v1/messages (care se    │
│    află în altă parte a codului, probabil unde este definit serverul).               │
│    Acest handler principal este cel care conține logica ce face efectiv apelul fetch │
│     către API-ul Gemini.                                                             │
│    Acest apel fetch din handler-ul principal NU este protejat de ExecutionGuard.     │
│    Prin urmare, dacă 5 cereri sosesc aproape simultan:                               │
│    executionGuard le va pune în coadă și va rula funcția router pentru fiecare, la   │
│    interval de 1 secundă.                                                            │
│    Dar, imediat ce fiecare router se termină, controlul trece la handler-ul          │
│    principal, care lansează imediat un fetch.                                        │
│    Rezultatul este că cele 5 apeluri fetch vor fi lansate tot la interval de ~1      │
│    secundă, exact ce vedeți în log-uri, declanșând eroarea 429 de la Google.         │
│    Soluția: Mutarea ExecutionGuard pentru a Înveli Apelul fetch                      │
│    Trebuie să mutați logica guardedExecute pentru a proteja exact bucata de cod care │
│     face cererea de rețea, nu doar router-ul.                                        │
│    Aceasta este o problemă de arhitectură. Nu poate fi rezolvată doar în index.ts.   │
│    Trebuie să identificați unde se află codul care construiește și trimite cererea   │
│    către furnizorii AI (OpenAI, Gemini, Anthropic) și să-l modificați acolo.         │
│    Planul de Refactorizare:                                                          │
│    Găsiți "Punctul de Contact": Localizați funcția sau clasa responsabilă pentru     │
│    comunicarea cu API-urile externe. Să o numim, ipotetic,                           │
│    makeApiRequest(providerConfig, requestBody).                                      │
│    Modificați "Punctul de Contact": Înveliți logica din interiorul acestei funcții   │
│    cu guardedExecute.                                                                │
│    Trebuie să regândim complet unde plasăm ExecutionGuard. Trebuie să-l plasăm în    │
│    jurul acțiunii de proxy-ere însăși. Acest lucru înseamnă că trebuie să găsim în   │
│    codul sursă al claude-code-router locul unde se face efectiv redirecționarea și   │
│    să învelim acea bucată de logică.                                                 │
│    Deoarece dumneavoastră sunteți autorul, aveți acces la această funcție. Probabil  │
│    se află în handler-ul principal al rutei /v1/messages.                            │
│    Planul de Refactorizare Definitiv:                                                │
│    Presupunând că undeva în codul dumneavoastră există o logică similară cu aceasta  │
│    (acesta este un exemplu standard pentru un reverse proxy în                       │
│    Fastify/Express):Protejează Acțiunea Reală: Acum, ExecutionGuard nu mai           │
│    protejează o simplă funcție de pregătire. El controlează și pune în coadă exact   │
│    momentul în care se inițiază conexiunea de rețea către Google.                    │
│    Respectă Temporizarea: Coada de așteptare din ExecutionGuard va pune acum o pauză │
│     de minDelayMs între fiecare execuție a proxy.web(...). Acest lucru va spația     │
│    cererile reale și va rezolva definitiv problema 429 Too Many Requests.            │
│    Gestionează Erorile Corect: Prin împachetarea într-o promisiune și respingerea ei │
│     în caz de eroare, permitem mecanismului de reîncercare (retry) din               │
│    ExecutionGuard să funcționeze corect pentru erorile de proxy.  
 
 Răspunsul pe scurt este: Da, funcția `$f` din bibliotecă rămâne cel mai potrivit 
  loc, iar planul nostru devine și mai relevant. De fapt, noua cerință de rotire a
  cheilor API face ca modificarea funcției $f să fie singurul loc corect unde putem
  implementa ambele funcționalități (coada de așteptare și rotirea cheilor) în mod
  curat.

  Haideți să integrez această nouă cerință în planul final complet.

  Analiza Noii Cerințe: Rotirea Cheilor API

  Documentul EXECUTION_GUARD_API_KEY_ROTATION_ANALYSIS.md este foarte bine gândit. El
  propune ca:
   1. Logica de management și selecție a cheilor să trăiască în ExecutionGuard.
      (Corect)
   2. ExecutionGuard să selecteze o cheie API (ex: prin round-robin) pentru providerii
      specificați (ex: "gemini"). (Corect)
   3. Pentru a face asta, ExecutionGuard trebuie să poată pasa cheia selectată către
      funcția care execută fetch. Acest lucru necesită o schimbare a semnăturii:
      funcția protejată trebuie să poată primi un context, de exemplu (context: { 
      apiKey?: string }) => Promise<T>.

  Acest ultim punct este crucial și se integrează perfect cu planul nostru de a
  modifica $f.

  ---

  Planul Final Complet (Incluzând Rotația Cheilor API)

  Obiectiv: Să modificăm biblioteca @musistudio/llms pentru a permite
  ExecutionGuard-ului nostru să controleze când se execută o cerere (prin coadă și
  rate-limit) și cu ce credențiale se execută (prin rotația cheilor API).

  Strategie: Rămâne aceeași: folosim patch-package pentru a modifica chirurgical
  funcția internă $f și transformerele asociate din server.cjs.

  ---

  Pașii de Implementare Detaliați:

  Pasul 1: Extinderea `ExecutionGuard` în Proiectul Nostru 
  (`src/utils/ExecutionGuard.ts`)

   * Acțiune: Înainte de a modifica biblioteca externă, implementăm logica de rotație
     a cheilor în propriul nostru fișier ExecutionGuard.ts, exact cum este descris în
     documentul de analiză.
   * Modificări Cheie:
       1. Adăugăm secțiunea keyManagement la interfața de configurare.
       2. Implementăm logica de selecție a cheii (selectApiKey).
       3. Cel mai important: Modificăm semnătura metodei execute pentru a pasa cheia
          selectată: requestFn devine requestFn: (context: { apiKey?: string }) => 
          Promise<T>.

  Pasul 2: Pregătirea Mediului pentru "Patching"

   * Acțiune: Instalăm patch-package și configurăm scriptul postinstall în
     package.json. (Acest pas rămâne neschimbat).

  Pasul 3: Modificarea Avansată a `server.cjs` (Patch-ul)

  Aici este locul unde cele două cerințe se unesc.

   1. Import `guardedExecute`: La fel ca înainte, importăm funcția noastră acum
      extinsă.
   2. Modificarea Funcției `$f`:
       * Apelul către guardedExecute va fi acum mai complex. Va trebui să paseze o
         funcție care acceptă noul context { apiKey }.
       * Logica din interiorul `guardedExecute`: Funcția pe care o pasăm va trebui să
         suprascrie header-ul de autorizare.
           * Conceptual:

    1             // Interiorul funcției $f modificate
    2             return guardedExecute(
    3               async ({ apiKey }) => { // Primim cheia de la 
      ExecutionGuard
    4 
    5                 // 'l' este obiectul cu opțiunile de fetch, construit de 
      $f
    6                 const finalFetchOptions = { ...l };
    7 
    8                 // Suprascriem cheia API DOAR dacă ExecutionGuard ne-a 
      dat una nouă
    9                 if (apiKey) {
   10                   finalFetchOptions.headers.set('x-goog-api-key',
      apiKey);
   11                   finalFetchOptions.headers.delete('Authorization'); // 
      Eliminăm alte credențiale
   12                 }
   13 
   14                 // Executăm fetch cu opțiunile finale
   15                 return fetch(url, finalFetchOptions);
   16               },
   17               { providerName: t.providerName, req: { ... } } // Context 
      pentru Guard
   18             );
   3. Modificarea Transformerelor (`ko`, `zi`):
       * Acțiune: La fel ca în planul anterior, adăugăm providerName: 'gemini' în
         obiectul config returnat de transformere. Acest lucru este esențial pentru ca
         ExecutionGuard să știe când să aplice rotația cheilor.

  Pasul 4: Curățarea și Finalizarea

   1. Eliminarea Hook-ului Vechi: La fel ca înainte, ștergem vechiul preHandler din
      src/index.ts.
   2. Crearea Patch-ului: Rulăm npx patch-package @musistudio/llms pentru a salva toate
      aceste modificări avansate.

  De ce este `$f` Locul Perfect pentru Ambele?

  Funcția $f este punctul ideal de intersecție. Se află după ce transformer-ul a
  pregătit cererea (deci știm ce provider se folosește) și înainte ca pachetul să fie
  trimis pe rețea. Acest lucru ne permite:
   1. Să pasăm providerName către ExecutionGuard.
   2. ExecutionGuard decide: "OK, pentru 'gemini', voi folosi cheia nr. 2 și voi
      aștepta 1 secundă."
   3. ExecutionGuard pasează înapoi atât permisiunea de a rula, cât și cheia nr. 2.
   4. Funcția noastră modificată din $f primește cheia nr. 2, o inserează în headerele
      cererii și abia apoi execută fetch.

  Acest plan integrat rezolvă ambele probleme într-un mod elegant și centralizat,
  confirmând că strategia de a modifica punctul $f este cea corectă și scalabilă.

  Dacă sunteți de acord cu acest plan final și complet, sunt gata să trec la
  scrierea codului necesar pentru modificări.



# Jurnal de Implementare: Adăugarea Cozii de Așteptare și Rotației de Chei în `@musistudio/llms`

Acest document detaliază procesul de analiză, descoperire, proiectare a soluției și obstacolele întâmpinate în încercarea de a extinde funcționalitatea bibliotecii `@musistudio/llms`.

## 1. Obiectivul Inițial

Scopul principal a fost să se adauge două funcționalități critice pentru a îmbunătăți robustețea și scalabilitatea interacțiunilor cu modelele de limbaj Gemini:

1.  **Coada de Așteptare (Request Queueing)**: Pentru a gestiona un volum mare de cereri fără a încălca limitele de rată ale API-ului.
2.  **Rotația Cheilor API (API Key Rotation)**: Pentru a distribui încărcarea pe mai multe chei API, crescând astfel debitul total.

Logica necesară pentru aceste operațiuni era deja implementată și testată în proiectul principal, în cadrul funcției `guardedExecute` din `src/utils/ExecutionGuard.ts`.

---

## 2. Faza de Analiză și Descoperire

Procesul de a găsi locul corect pentru a aplica aceste modificări a fost unul iterativ.

### 2.1. Prima Ipoteză: Modificarea Transformer-ului Gemini

Intuiția inițială, bazată pe o arhitectură modulară, a fost că modificările ar trebui aplicate în `gemini.transformer.ts`. Acesta părea locul logic, deoarece este specific pentru Gemini.

*   **Descoperire**: Analiza codului sursă (extras din source maps) a relevat că transformerele au un rol de "traducători". Ele pregătesc corpul (`body`) și antetele (`headers`) cererii pentru a se potrivi cu specificațiile API-ului de destinație, dar **nu execută** cererea `fetch`. Ele doar returnează un obiect de configurare.

### 2.2. Urmărirea Fluxului de Execuție

Odată ce s-a stabilit că transformer-ul nu este punctul final, am urmărit fluxul de date prin aplicație pentru a găsi unde este consumat obiectul de configurare returnat de transformer.

1.  **`gemini.transformer.ts`**: Pregătește cererea.
2.  **`src/api/routes.ts`**: Preia cererea pregătită în interiorul funcției `handleTransformerEndpoint`. Aceasta, la rândul ei, apelează `sendRequestToProvider`.
3.  **`src/utils/request.ts`**: În interiorul `sendRequestToProvider`, am descoperit apelul final către o funcție numită `sendUnifiedRequest`. Această funcție este "poștașul" final care execută apelul `fetch`.

### 2.3. Identificarea Punctului de Intervenție Corect

Funcția `sendUnifiedRequest` din `src/utils/request.ts` a fost identificată ca fiind punctul ideal de intervenție. Deoarece toate cererile, indiferent de provider, trec prin această funcție înainte de a fi trimise pe rețea, modificarea ei ne-ar oferi controlul necesar pentru a implementa logica dorită într-un singur loc, fără a duplica codul.

---

## 3. Provocarea Tehnică: Codul Minificat

Investigația a scos la iveală o provocare tehnică majoră. Fișierul care trebuie modificat în `node_modules` este `dist/cjs/server.cjs`. Acesta nu este cod sursă lizibil, ci rezultatul unui proces de build care îl face **compilat** și **minificat**.

*   **Compilare**: Codul original TypeScript este transformat în JavaScript.
*   **Minificare**: Toate elementele care ajută la lizibilitate (spații, comentarii, nume de variabile) sunt eliminate sau prescurtate (ex: `sendUnifiedRequest` devine `h0`).

Încercarea de a aplica un patch direct pe acest fișier este extrem de riscantă. O singură greșeală ar putea corupe întreaga bibliotecă. Tentativele de a găsi șiruri de text unice pentru înlocuire s-au dovedit a fi nesigure și fragile.

---

## 4. Soluția Propusă și Blocajul Tehnic

### 4.1. Extragerea Codului Sursă Original

Un pas înainte a fost descoperirea fișierului `server.cjs.map` (source map). Acest fișier a permis reconstituirea codului sursă original, lizibil, pentru toate modulele interne ale bibliotecii, permițând o analiză clară și proiectarea unei soluții corecte.

### 4.2. Design-ul Soluției Tehnice

Soluția cea mai curată și robustă este **injectarea dependenței**: proiectul principal face funcția `guardedExecute` disponibilă bibliotecii, în loc ca biblioteca să încerce să o importe.

1.  **Expunerea Funcției (în Proiectul Principal)**: În fișierul de pornire (`src/server.ts` sau `src/index.ts`), se adaugă `guardedExecute` ca un "decorator" pe instanța de server `fastify`.
    ```typescript
    // În proiectul principal, ex: src/server.ts
    import { guardedExecute } from './utils/ExecutionGuard';
    const server = new LLMServer({ ... });
    server.app.decorate('guardedExecute', guardedExecute);
    ```

2.  **Modificarea Bibliotecii (Conceptual)**:
    *   **`src/api/routes.ts`**: Funcția `sendRequestToProvider` ar fi modificată pentru a accesa `fastify.guardedExecute` și a-l pasa mai departe către `sendUnifiedRequest`.
    *   **`src/utils/request.ts`**: Funcția `sendUnifiedRequest` ar fi modificată pentru a primi `guardedExecute` ca un nou parametru. Logica internă ar arăta astfel:

        ```typescript
        // Concept în interiorul sendUnifiedRequest
        if (guardedExecute) {
          return guardedExecute(
            async ({ apiKey }) => {
              if (apiKey) {
                // Modifică headerele cu noua cheie
                fetchOptions.headers.set('x-goog-api-key', apiKey);
                fetchOptions.headers.delete('Authorization');
              }
              return fetch(url, fetchOptions);
            },
            { providerName: config.providerName, req: request }
          );
        } else {
          // Comportamentul original
          return fetch(url, fetchOptions);
        }
        ```

### 4.3. Blocajul Final: Recompilarea

Deși avem codul sursă modificat și un plan solid, ne lovim de un obstacol tehnic insurmontabil în contextul actual: **lipsa uneltelor de build**.

Codul sursă este scris în TypeScript și folosește module (`import`/`export`). Pentru a produce fișierul final `server.cjs`, aceste fișiere trebuie **compilate** și **împachetate** ("bundled"). Acest proces necesită un mediu de dezvoltare specific (cu `typescript`, `esbuild`/`webpack`, etc.), pe care nu îl am la dispoziție.

---

## 5. Alternative Analizate și Respinse

*   **Concatenarea Fișierelor Sursă**: A lipi pur și simplu fișierele sursă modificate nu funcționează, deoarece modulele `import`/`export` nu ar fi rezolvate corect.
*   **Monkey-Patching Global**: A suprascrie global funcția `fetch` este o practică periculoasă, deoarece ar afecta toate apelurile `fetch` din aplicație, nu doar pe cele din bibliotecă, putând introduce bug-uri imprevizibile.

---

## 6. Concluzie și Calea de Urmat

Implementarea funcționalităților dorite este în prezent **blocată** de imposibilitatea de a recompila biblioteca `@musistudio/llms` după aplicarea modificărilor necesare.

**Recomandarea fermă și singura cale sigură de a proceda este obținerea accesului la proiectul sursă original al bibliotecii.**

Cu acces la surse, pașii ar fi simpli:
1.  Aplicarea modificărilor de cod pe care le-am detaliat.
2.  Rularea comenzii de build a proiectului (ex: `npm run build`).
3.  Utilizarea noii versiuni a bibliotecii.

Toată munca de analiză și proiectare a soluției este completă. Sunt pregătit să ofer fișierele sursă modificate imediat ce mediul de build devine disponibil.

---

## Anexă: Cod Sursă Modificat (Conceptual)

Aceasta este versiunea modificată a funcției `sendUnifiedRequest` din `src/utils/request.ts` care implementează logica dorită.

```typescript
import { ProxyAgent } from "undici";
import { UnifiedChatRequest } from "../types/llm";

// Funcția originală este modificată pentru a accepta un al cincilea parametru: guardedExecute
export function sendUnifiedRequest(
  url: URL | string,
  request: UnifiedChatRequest,
  config: any,
  logger?: any,
  guardedExecute?: Function // Parametrul injectat
): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (config.headers) {
    Object.entries(config.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value as string);
      }
    });
  }

  let combinedSignal: AbortSignal;
  const timeoutSignal = AbortSignal.timeout(config.TIMEOUT ?? 60 * 1000 * 60);

  if (config.signal) {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    config.signal.addEventListener("abort", abortHandler);
    timeoutSignal.addEventListener("abort", abortHandler);
    combinedSignal = controller.signal;
  } else {
    combinedSignal = timeoutSignal;
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(request),
    signal: combinedSignal,
  };

  if (config.httpsProxy) {
    (fetchOptions as any).dispatcher = new ProxyAgent(
      new URL(config.httpsProxy).toString()
    );
  }

  logger?.debug(
    {
      request: fetchOptions,
      headers: Object.fromEntries(headers.entries()),
      requestUrl: typeof url === "string" ? url : url.toString(),
      useProxy: config.httpsProxy,
    },
    "final request"
  );

  // Aici este noua logică
  if (guardedExecute) {
    logger?.info(`[LLM-Patch] Request for '${config.providerName}' is being handled by ExecutionGuard.`);
    return guardedExecute(
      async ({ apiKey }: { apiKey?: string }) => {
        if (apiKey) {
          logger?.debug(`[LLM-Patch] Using rotated API key for ${config.providerName}.`);
          headers.set("x-goog-api-key", apiKey);
          // Eliminăm header-ul de autorizare original pentru a nu intra în conflict
          headers.delete("Authorization");
        }
        return fetch(typeof url === "string" ? url : url.toString(), fetchOptions);
      },
      { providerName: config.providerName, req: request }
    );
  } else {
    // Comportamentul original dacă guardedExecute nu este injectat
    return fetch(typeof url === "string" ? url : url.toString(), fetchOptions);
  }
}
```