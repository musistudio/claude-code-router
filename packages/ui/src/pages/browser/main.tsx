import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Check, KeyRound, LoaderCircle, Plus, RotateCw, UserRound, X } from "lucide-react";
import type { BuiltInBrowserState, ChromeLoginImportJob, ChromeLoginImportRequest } from "@ccr/core/contracts/app";

declare global {
  interface Window {
    ccrBrowser?: {
      back: (tabId?: string) => Promise<BuiltInBrowserState>;
      closeTab: (tabId: string) => Promise<BuiltInBrowserState>;
      forward: (tabId?: string) => Promise<BuiltInBrowserState>;
      getChromeLoginImport: (id: string) => Promise<ChromeLoginImportJob | undefined>;
      getState: () => Promise<BuiltInBrowserState>;
      navigate: (url: string, tabId?: string) => Promise<BuiltInBrowserState>;
      newTab: (url?: string) => Promise<BuiltInBrowserState>;
      reload: (tabId?: string) => Promise<BuiltInBrowserState>;
      resolveAutomationHandoff: (status: "completed" | "dismissed") => Promise<BuiltInBrowserState>;
      selectTab: (tabId: string) => Promise<BuiltInBrowserState>;
      startChromeLoginImport: (request: ChromeLoginImportRequest) => Promise<ChromeLoginImportJob>;
      onStateChanged: (callback: (state: BuiltInBrowserState) => void) => () => void;
    };
  }
}

const emptyState: BuiltInBrowserState = {
  apps: [],
  tabs: []
};
const browserHomeUrl = "about:blank";

function BrowserChrome() {
  const [state, setState] = useState<BuiltInBrowserState>(emptyState);
  const [addressDraft, setAddressDraft] = useState("");
  const [chromeImportDialogOpen, setChromeImportDialogOpen] = useState(false);
  const [chromeImportDomainsDraft, setChromeImportDomainsDraft] = useState("");
  const [chromeImportError, setChromeImportError] = useState("");
  const [chromeImportJob, setChromeImportJob] = useState<ChromeLoginImportJob | undefined>();
  const [chromeImportMessage, setChromeImportMessage] = useState("");
  const [chromeImportStarting, setChromeImportStarting] = useState(false);
  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId),
    [state.activeTabId, state.tabs]
  );
  const handoff = state.automationHandoff;

  useEffect(() => {
    let cancelled = false;
    void window.ccrBrowser?.getState().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });
    const unsubscribe = window.ccrBrowser?.onStateChanged(setState);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setAddressDraft(activeTab?.url || "");
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    if (!chromeImportJob || chromeImportJob.status !== "pending") {
      return;
    }
    const interval = window.setInterval(() => {
      void window.ccrBrowser?.getChromeLoginImport(chromeImportJob.id).then((job) => {
        if (!job) {
          setChromeImportJob(undefined);
          return;
        }
        setChromeImportJob(job);
        if (job.status === "completed" && activeTab?.id && activeTabMatchesImport(activeTab.url, job.domains)) {
          void run(window.ccrBrowser?.reload(activeTab.id));
        }
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeTab?.id, activeTab?.url, chromeImportJob]);

  async function run(action: Promise<BuiltInBrowserState> | undefined): Promise<void> {
    if (!action) {
      return;
    }
    setState(await action);
  }

  function submitNavigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(window.ccrBrowser?.navigate(addressDraft, activeTab?.id));
  }

  async function submitChromeLoginImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domains = parseImportDomains(chromeImportDomainsDraft);
    if (domains.length === 0) {
      setChromeImportError("Enter at least one domain.");
      return;
    }
    setChromeImportError("");
    setChromeImportMessage("");
    setChromeImportStarting(true);
    try {
      const job = await window.ccrBrowser?.startChromeLoginImport({ domains, openConfirmationPage: true });
      if (!job) {
        throw new Error("Chrome login import is unavailable.");
      }
      setChromeImportJob(job);
      setChromeImportDomainsDraft(job.domains.join(", "));
      setChromeImportMessage("Confirmation page opened. If it did not open in Chrome, copy the extension import URL into the Chrome extension popup.");
    } catch (error) {
      setChromeImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setChromeImportStarting(false);
    }
  }

  function chromeImportTitle(): string {
    if (!chromeImportJob) {
      return "Import login from Chrome";
    }
    if (chromeImportJob.status === "completed") {
      return `Chrome import complete: ${chromeImportJob.result?.imported ?? 0} imported, ${chromeImportJob.result?.skipped ?? 0} skipped`;
    }
    if (chromeImportJob.status === "expired") {
      return "Chrome import expired";
    }
    if (chromeImportJob.status === "failed") {
      return "Chrome import failed";
    }
    return "Chrome import pending. Confirm it in the browser window.";
  }

  async function handleChromeImportButton() {
    if (chromeImportJob?.status === "pending") {
      setChromeImportDialogOpen(true);
      setChromeImportError("");
      setChromeImportMessage("Chrome import is pending.");
      return;
    }
    setChromeImportDomainsDraft(activeTabDomain(activeTab?.url));
    setChromeImportDialogOpen(true);
    setChromeImportError("");
    setChromeImportMessage("");
  }

  async function copyChromeImportUrl(kind: "confirm" | "import") {
    const url = kind === "confirm" ? chromeImportJob?.confirmUrl : chromeImportJob?.importUrl;
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setChromeImportError("");
      setChromeImportMessage(kind === "confirm" ? "Confirmation page URL copied." : "Extension import URL copied.");
    } catch (error) {
      setChromeImportMessage("");
      setChromeImportError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className={`browser-shell ${handoff ? "has-handoff" : ""}`}>
      <div className="tabs-row">
        <div className="traffic-space" />
        <div className="tabs-strip">
          {state.tabs.map((tab) => (
            <button
              className={`tab ${tab.id === state.activeTabId ? "active" : ""}`}
              key={tab.id}
              onClick={() => void run(window.ccrBrowser?.selectTab(tab.id))}
              title={tab.title || tab.url}
              type="button"
            >
              <span className="tab-title">{tab.isLoading ? "Loading" : tab.title || tab.url || "New Tab"}</span>
              <span
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  void run(window.ccrBrowser?.closeTab(tab.id));
                }}
                role="button"
                tabIndex={-1}
                title="Close tab"
              >
                <X size={13} strokeWidth={2.2} />
              </span>
            </button>
          ))}
          <button className="new-tab-button" onClick={() => void run(window.ccrBrowser?.newTab())} title="New tab" type="button">
            <Plus size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <form className="toolbar" onSubmit={submitNavigation}>
        <button
          className="icon-button"
          disabled={!activeTab?.canGoBack}
          onClick={() => void run(window.ccrBrowser?.back(activeTab?.id))}
          title="Back"
          type="button"
        >
          <ArrowLeft size={17} strokeWidth={2.2} />
        </button>
        <button
          className="icon-button"
          disabled={!activeTab?.canGoForward}
          onClick={() => void run(window.ccrBrowser?.forward(activeTab?.id))}
          title="Forward"
          type="button"
        >
          <ArrowRight size={17} strokeWidth={2.2} />
        </button>
        <button
          className="icon-button"
          disabled={!activeTab}
          onClick={() => void run(window.ccrBrowser?.reload(activeTab?.id))}
          title="Refresh"
          type="button"
        >
          {activeTab?.isLoading ? <LoaderCircle className="spin" size={17} strokeWidth={2.2} /> : <RotateCw size={16} strokeWidth={2.2} />}
        </button>
        <input
          aria-label="Address"
          autoComplete="off"
          disabled={!activeTab}
          onChange={(event) => setAddressDraft(event.target.value)}
          spellCheck={false}
          value={addressDraft}
        />
        <button
          className={`icon-button ${chromeImportJob?.status === "pending" ? "active-import" : ""}`}
          disabled={!activeTab}
          onClick={() => void handleChromeImportButton()}
          title={chromeImportTitle()}
          type="button"
        >
          <KeyRound size={16} strokeWidth={2.2} />
        </button>
      </form>

      {handoff ? (
        <div className="automation-handoff" role="status">
          <div className="handoff-copy">
            <UserRound size={16} strokeWidth={2.2} />
            <span className="handoff-message">{handoff.message}</span>
            {handoff.reason ? <span className="handoff-reason">{handoff.reason}</span> : null}
          </div>
          <div className="handoff-actions">
            <button
              className="handoff-button primary"
              onClick={() => void run(window.ccrBrowser?.resolveAutomationHandoff("completed"))}
              type="button"
            >
              <Check size={15} strokeWidth={2.4} />
              <span>Done</span>
            </button>
            <button
              className="handoff-button"
              onClick={() => void run(window.ccrBrowser?.resolveAutomationHandoff("dismissed"))}
              type="button"
            >
              <X size={14} strokeWidth={2.3} />
              <span>Hide</span>
            </button>
          </div>
        </div>
      ) : null}

      {chromeImportDialogOpen ? (
        <div className="chrome-import-backdrop" role="presentation">
          <form className="chrome-import-dialog" onSubmit={submitChromeLoginImport}>
            <div className="chrome-import-header">
              <div className="chrome-import-title">Import login from Chrome</div>
              <button
                className="icon-button"
                onClick={() => setChromeImportDialogOpen(false)}
                title="Close"
                type="button"
              >
                <X size={14} strokeWidth={2.3} />
              </button>
            </div>
            <label className="chrome-import-field">
              <span>Domains</span>
              <input
                autoFocus
                disabled={chromeImportStarting || chromeImportJob?.status === "pending"}
                onChange={(event) => setChromeImportDomainsDraft(event.target.value)}
                placeholder="example.com, auth.example.com"
                spellCheck={false}
                value={chromeImportDomainsDraft}
              />
            </label>
            {chromeImportJob?.status === "pending" ? (
              <>
                <label className="chrome-import-field">
                  <span>Extension import URL</span>
                  <input readOnly value={chromeImportJob.importUrl} />
                </label>
                <label className="chrome-import-field">
                  <span>Confirmation page URL</span>
                  <input readOnly value={chromeImportJob.confirmUrl} />
                </label>
              </>
            ) : null}
            {chromeImportError ? <div className="chrome-import-error" role="alert">{chromeImportError}</div> : null}
            {chromeImportMessage ? <div className="chrome-import-message" role="status">{chromeImportMessage}</div> : null}
            <div className="chrome-import-actions">
              {chromeImportJob?.status === "pending" ? (
                <>
                  <button className="chrome-import-button primary" onClick={() => void copyChromeImportUrl("import")} type="button">
                    Copy import URL
                  </button>
                  <button className="chrome-import-button" onClick={() => void copyChromeImportUrl("confirm")} type="button">
                    Copy page URL
                  </button>
                </>
              ) : (
                <button className="chrome-import-button primary" disabled={chromeImportStarting} type="submit">
                  {chromeImportStarting ? "Starting" : "Start import"}
                </button>
              )}
              <button className="chrome-import-button" onClick={() => setChromeImportDialogOpen(false)} type="button">
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

    </div>
  );
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<BrowserChrome />);

function activeTabDomain(url: string | undefined): string {
  if (!url || url === browserHomeUrl) {
    return "";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function activeTabMatchesImport(url: string | undefined, domains: string[]): boolean {
  const host = activeTabDomain(url).toLowerCase();
  return Boolean(host && domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
}

function parseImportDomains(value: string): string[] {
  return [...new Set(value
    .split(/[,\n]/)
    .map((item) => normalizeImportDomain(item))
    .filter((item): item is string => Boolean(item)))];
}

function normalizeImportDomain(value: string): string | undefined {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    const domain = raw.replace(/^\*\./, "").split("/")[0];
    return domain && !domain.includes(" ") ? domain : undefined;
  }
}

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: light dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  body {
    background: Canvas;
    color: CanvasText;
  }

  button,
  input {
    -webkit-app-region: no-drag;
    font: inherit;
  }

  button {
    color: CanvasText;
  }

  .browser-shell {
    display: grid;
    grid-template-rows: 38px 44px minmax(0, 1fr);
    height: 100%;
    min-width: 0;
    position: relative;
    width: 100%;
  }

  .browser-shell.has-handoff {
    grid-template-rows: 38px 44px 44px minmax(0, 1fr);
  }

  .tabs-row {
    -webkit-app-region: drag;
    align-items: end;
    background: color-mix(in srgb, CanvasText 5%, Canvas);
    display: flex;
    min-width: 0;
    padding: 5px 8px 0 0;
  }

  .traffic-space {
    flex: 0 0 76px;
    height: 100%;
  }

  .tabs-strip {
    align-items: end;
    display: flex;
    flex: 1;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .tab,
  .new-tab-button,
  .icon-button {
    align-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    outline: none;
  }

  .tab {
    gap: 6px;
    height: 31px;
    justify-content: flex-start;
    max-width: 210px;
    min-width: 86px;
    padding: 0 7px 0 10px;
    width: clamp(110px, 18vw, 210px);
  }

  .tab.active {
    background: Canvas;
    box-shadow: 0 -1px 4px color-mix(in srgb, CanvasText 7%, transparent);
  }

  .tab:not(.active):hover,
  .new-tab-button:hover,
  .icon-button:hover:not(:disabled) {
    background: color-mix(in srgb, CanvasText 8%, transparent);
  }

  .tab-title {
    flex: 1;
    font-size: 12px;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-close {
    align-items: center;
    border-radius: 50%;
    display: inline-flex;
    flex: 0 0 auto;
    height: 18px;
    justify-content: center;
    width: 18px;
  }

  .tab-close:hover {
    background: color-mix(in srgb, CanvasText 10%, transparent);
  }

  .new-tab-button {
    flex: 0 0 auto;
    height: 28px;
    margin-bottom: 2px;
    width: 30px;
  }

  .toolbar {
    -webkit-app-region: drag;
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
    display: grid;
    gap: 4px;
    grid-template-columns: 32px 32px 32px minmax(0, 1fr) 32px;
    padding: 6px 10px;
  }

  .icon-button {
    height: 30px;
    width: 30px;
  }

  .icon-button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .icon-button.active-import {
    background: color-mix(in srgb, #0f766e 16%, transparent);
    color: color-mix(in srgb, #0f766e 82%, CanvasText);
  }

  input {
    background: color-mix(in srgb, CanvasText 4%, Canvas);
    border: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
    border-radius: 8px;
    color: CanvasText;
    height: 30px;
    min-width: 0;
    outline: none;
    padding: 0 10px;
    width: 100%;
  }

  input:focus {
    border-color: color-mix(in srgb, #2563eb 70%, CanvasText 30%);
  }

  .automation-handoff {
    -webkit-app-region: drag;
    align-items: center;
    background: color-mix(in srgb, #f59e0b 16%, Canvas);
    border-bottom: 1px solid color-mix(in srgb, #92400e 24%, transparent);
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    padding: 6px 10px;
  }

  .handoff-copy {
    align-items: center;
    color: color-mix(in srgb, #78350f 76%, CanvasText);
    display: flex;
    gap: 8px;
    min-width: 0;
  }

  .handoff-message,
  .handoff-reason {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .handoff-message {
    font-size: 13px;
    font-weight: 700;
  }

  .handoff-reason {
    color: color-mix(in srgb, CanvasText 58%, transparent);
    font-size: 12px;
  }

  .handoff-actions {
    -webkit-app-region: no-drag;
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
  }

  .handoff-button {
    align-items: center;
    background: color-mix(in srgb, CanvasText 5%, Canvas);
    border: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
    border-radius: 7px;
    display: inline-flex;
    gap: 5px;
    height: 30px;
    justify-content: center;
    min-width: 0;
    padding: 0 9px;
    white-space: nowrap;
  }

  .handoff-button:hover {
    background: color-mix(in srgb, CanvasText 9%, Canvas);
  }

  .handoff-button.primary {
    background: #166534;
    border-color: #166534;
    color: white;
  }

  .handoff-button.primary:hover {
    background: #14532d;
  }

  .chrome-import-backdrop {
    align-items: start;
    background: color-mix(in srgb, Canvas 82%, transparent);
    bottom: 0;
    display: flex;
    justify-content: center;
    left: 0;
    padding: 28px 16px;
    position: fixed;
    right: 0;
    top: 82px;
    z-index: 20;
  }

  .browser-shell.has-handoff .chrome-import-backdrop {
    top: 126px;
  }

  .chrome-import-dialog {
    background: Canvas;
    border: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
    border-radius: 8px;
    box-shadow: 0 18px 45px color-mix(in srgb, CanvasText 12%, transparent);
    display: grid;
    gap: 12px;
    max-width: 520px;
    padding: 14px;
    width: min(520px, 100%);
  }

  .chrome-import-header {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-width: 0;
  }

  .chrome-import-title {
    font-size: 13px;
    font-weight: 750;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chrome-import-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .chrome-import-field span {
    color: color-mix(in srgb, CanvasText 62%, transparent);
    font-size: 11px;
    font-weight: 650;
  }

  .chrome-import-error,
  .chrome-import-message {
    border-radius: 7px;
    font-size: 12px;
    line-height: 1.4;
    padding: 8px 9px;
  }

  .chrome-import-error {
    background: color-mix(in srgb, #dc2626 9%, Canvas);
    color: color-mix(in srgb, #b91c1c 82%, CanvasText);
  }

  .chrome-import-message {
    background: color-mix(in srgb, #0f766e 10%, Canvas);
    color: color-mix(in srgb, #0f766e 82%, CanvasText);
  }

  .chrome-import-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: end;
  }

  .chrome-import-button {
    align-items: center;
    background: color-mix(in srgb, CanvasText 5%, Canvas);
    border: 1px solid color-mix(in srgb, CanvasText 13%, transparent);
    border-radius: 7px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    height: 30px;
    justify-content: center;
    min-width: 86px;
    padding: 0 10px;
  }

  .chrome-import-button:hover:not(:disabled) {
    background: color-mix(in srgb, CanvasText 9%, Canvas);
  }

  .chrome-import-button:disabled {
    cursor: default;
    opacity: 0.54;
  }

  .chrome-import-button.primary {
    background: #166534;
    border-color: #166534;
    color: white;
  }

  .chrome-import-button.primary:hover:not(:disabled) {
    background: #14532d;
  }

  .spin {
    animation: spin 0.9s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .automation-handoff {
      gap: 6px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .handoff-reason {
      display: none;
    }

    .handoff-button span {
      display: none;
    }

    .handoff-button {
      padding: 0 8px;
      width: 32px;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
document.head.appendChild(style);
