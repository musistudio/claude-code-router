chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ccr-login-import-confirm") {
    return false;
  }

  runImport(message.importUrl)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ error: formatError(error), ok: false }));
  return true;
});

async function runImport(importUrl) {
  const normalizedImportUrl = normalizeImportUrl(importUrl);
  if (!normalizedImportUrl) {
    throw new Error("Invalid CCR import URL.");
  }

  const job = await fetchImportJob(normalizedImportUrl);
  const domains = Array.isArray(job.domains) ? job.domains.map(normalizeDomain).filter(Boolean) : [];
  if (domains.length === 0) {
    throw new Error("CCR import job does not include any domains.");
  }

  await ensureHostPermissions(domains);

  const cookies = await readCookiesForDomains(domains);
  const localStorageEntries = await readLocalStorageForDomains(domains, cookies);
  if (cookies.length === 0 && localStorageEntries.length === 0) {
    throw new Error("No cookies or localStorage entries were found for the selected domains.");
  }

  return await submitLoginState(normalizedImportUrl, cookies, localStorageEntries, domains);
}

async function fetchImportJob(importUrl) {
  const response = await fetch(importUrl, {
    headers: {
      "x-ccr-login-import": "chrome-extension"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `CCR import job request failed (${response.status}).`);
  }
  if (!body.job || body.job.status !== "pending") {
    throw new Error(`CCR import job is ${body.job?.status || "unavailable"}.`);
  }
  return body.job;
}

async function submitLoginState(importUrl, cookies, localStorage, domains) {
  const response = await fetch(`${importUrl.replace(/\/+$/, "")}/cookies`, {
    body: JSON.stringify({
      cookies,
      domains,
      localStorage,
      source: {
        browser: "chrome",
        extension: chrome.runtime.getManifest().version
      }
    }),
    headers: {
      "content-type": "application/json",
      "x-ccr-login-import": "chrome-extension"
    },
    method: "POST"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `CCR login import failed (${response.status}).`);
  }
  return body.result || {};
}

async function readCookiesForDomains(domains) {
  const cookies = [];
  for (const domain of domains) {
    cookies.push(...await chrome.cookies.getAll({ domain }));
  }
  return dedupeCookies(cookies);
}

async function readLocalStorageForDomains(domains, cookies) {
  const origins = localStorageOriginsForDomains(domains, cookies);
  const entries = [];
  for (const origin of origins) {
    const entry = await readLocalStorageForOrigin(origin).catch(() => undefined);
    if (entry && Object.keys(entry.items).length > 0) {
      entries.push(entry);
    }
  }
  return entries;
}

async function readLocalStorageForOrigin(origin) {
  const tab = await chrome.tabs.create({
    active: false,
    url: `${origin}/`
  });
  try {
    await waitForTabLoad(tab.id, 15000);
    const [frameResult] = await chrome.scripting.executeScript({
      func: () => {
        const items = {};
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key !== null) {
            items[key] = window.localStorage.getItem(key) || "";
          }
        }
        return {
          items,
          origin: window.location.origin
        };
      },
      target: { tabId: tab.id },
      world: "MAIN"
    });
    const result = frameResult?.result;
    if (!result || !allowedLocalStorageOrigin(result.origin, origin)) {
      return undefined;
    }
    return result;
  } finally {
    if (tab.id !== undefined) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
  }
}

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeout);
      resolve();
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    };
    const timeout = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function dedupeCookies(cookies) {
  const seen = new Set();
  const result = [];
  for (const cookie of cookies) {
    const partitionKey = cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : "";
    const key = `${cookie.storeId || ""}\n${cookie.domain}\n${cookie.path}\n${cookie.name}\n${partitionKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cookie);
    }
  }
  return result;
}

function localStorageOriginsForDomains(domains, cookies) {
  const origins = new Set();
  for (const domain of domains) {
    if (domain === "localhost" || isIpAddress(domain)) {
      origins.add(`http://${domain}`);
      origins.add(`https://${domain}`);
    } else {
      origins.add(`https://${domain}`);
    }
  }

  for (const cookie of cookies) {
    const host = normalizeDomain(cookie.domain);
    if (!host || !cookie.hostOnly || !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      continue;
    }
    origins.add(`${cookie.secure === false ? "http" : "https"}://${host}`);
  }

  return [...origins];
}

function originsForDomains(domains) {
  return [...new Set(domains.flatMap((domain) => {
    if (domain === "localhost" || isIpAddress(domain)) {
      return [
        `http://${domain}/*`,
        `https://${domain}/*`
      ];
    }
    return [
      `http://${domain}/*`,
      `https://${domain}/*`,
      `http://*.${domain}/*`,
      `https://*.${domain}/*`
    ];
  }))];
}

async function ensureHostPermissions(domains) {
  const origins = originsForDomains(domains);
  const granted = await chrome.permissions.contains({ origins });
  if (granted) {
    return;
  }
  throw new Error(
    [
      `CCR Login Import does not have Chrome site access for ${domains.join(", ")}.`,
      "Reload the unpacked extension after updating it, then grant the extension site access for the requested domains in Chrome extensions settings."
    ].join(" ")
  );
}

function normalizeImportUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      return "";
    }
    if (!/^\/chrome-import\/jobs\/[^/]+\/?$/.test(url.pathname)) {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeDomain(value) {
  return typeof value === "string"
    ? value.trim().replace(/^\*\./, "").replace(/^\./, "").toLowerCase()
    : "";
}

function allowedLocalStorageOrigin(actualOrigin, requestedOrigin) {
  try {
    const actual = new URL(actualOrigin);
    const requested = new URL(requestedOrigin);
    return actual.protocol === requested.protocol && actual.hostname === requested.hostname && actual.port === requested.port;
  } catch {
    return false;
  }
}

function isIpAddress(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
