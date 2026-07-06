import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Globe2, LoaderCircle, Plus, RotateCw, Search, X } from "lucide-react";
import type { BuiltInBrowserState } from "@ccr/core/contracts/app";

declare global {
  interface Window {
    ccrBrowser?: {
      back: (tabId?: string) => Promise<BuiltInBrowserState>;
      closeTab: (tabId: string) => Promise<BuiltInBrowserState>;
      forward: (tabId?: string) => Promise<BuiltInBrowserState>;
      getState: () => Promise<BuiltInBrowserState>;
      navigate: (url: string, tabId?: string) => Promise<BuiltInBrowserState>;
      newTab: (url?: string) => Promise<BuiltInBrowserState>;
      reload: (tabId?: string) => Promise<BuiltInBrowserState>;
      selectTab: (tabId: string) => Promise<BuiltInBrowserState>;
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
  const [homeDraft, setHomeDraft] = useState("");
  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId),
    [state.activeTabId, state.tabs]
  );
  const homeVisible = activeTab?.url === browserHomeUrl;

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
    setHomeDraft("");
  }, [activeTab?.id]);

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

  function submitHomeNavigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(window.ccrBrowser?.navigate(homeDraft, activeTab?.id));
  }

  function navigateTo(url: string) {
    setHomeDraft(url);
    void run(window.ccrBrowser?.navigate(url, activeTab?.id));
  }

  return (
    <div className="browser-shell">
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
      </form>

      {homeVisible ? (
        <main className="home-page">
          <section className="home-content" aria-label="New tab">
            <form className="home-search" onSubmit={submitHomeNavigation}>
              <Search className="home-search-icon" size={18} strokeWidth={2.2} />
              <input
                aria-label="Search or enter address"
                autoComplete="off"
                autoFocus
                onChange={(event) => setHomeDraft(event.target.value)}
                placeholder="Search or enter address"
                spellCheck={false}
                value={homeDraft}
              />
            </form>
            {state.apps.length > 0 ? (
              <div className="installed-apps" aria-label="Installed apps">
                {state.apps.map((app) => (
                  <button className="installed-app" key={`${app.pluginId}:${app.id}`} onClick={() => navigateTo(app.url)} type="button">
                    <span className="installed-app-icon">{app.icon?.trim() || app.name.trim().slice(0, 1).toUpperCase()}</span>
                    <span className="installed-app-copy">
                      <span className="installed-app-name">{app.name}</span>
                      <span className="installed-app-meta">{app.description || app.pluginId}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </main>
      ) : null}
    </div>
  );
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<BrowserChrome />);

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
    width: 100%;
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
    grid-template-columns: 32px 32px 32px minmax(0, 1fr);
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

  .home-page {
    align-items: flex-start;
    background:
      linear-gradient(135deg, color-mix(in srgb, #0f766e 9%, Canvas), transparent 34%),
      linear-gradient(315deg, color-mix(in srgb, #2563eb 8%, Canvas), transparent 38%),
      Canvas;
    display: flex;
    justify-content: center;
    min-height: 0;
    overflow: auto;
    padding: 96px 24px 56px;
  }

  .home-content {
    align-items: center;
    display: flex;
    flex-direction: column;
    max-width: 720px;
    min-width: 0;
    text-align: center;
    width: min(720px, 100%);
  }

  .home-search {
    -webkit-app-region: no-drag;
    max-width: 640px;
    position: relative;
    width: 100%;
  }

  .home-search input {
    background: Canvas;
    border-radius: 14px;
    box-shadow: 0 18px 45px color-mix(in srgb, CanvasText 10%, transparent);
    font-size: 15px;
    height: 50px;
    padding-left: 44px;
  }

  .home-search-icon {
    color: color-mix(in srgb, CanvasText 48%, transparent);
    left: 16px;
    pointer-events: none;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
  }

  .installed-apps {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 22px;
    max-width: 640px;
    width: 100%;
  }

  .installed-app {
    align-items: center;
    background: Canvas;
    border: 1px solid color-mix(in srgb, CanvasText 11%, transparent);
    border-radius: 12px;
    box-shadow: 0 12px 28px color-mix(in srgb, CanvasText 7%, transparent);
    display: flex;
    gap: 11px;
    min-width: 0;
    padding: 12px;
    text-align: left;
  }

  .installed-app:hover {
    background: color-mix(in srgb, CanvasText 4%, Canvas);
  }

  .installed-app-icon {
    align-items: center;
    background: color-mix(in srgb, #0f766e 14%, Canvas);
    border-radius: 10px;
    color: color-mix(in srgb, #0f766e 74%, CanvasText);
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 14px;
    font-weight: 750;
    height: 36px;
    justify-content: center;
    width: 36px;
  }

  .installed-app-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .installed-app-name,
  .installed-app-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .installed-app-name {
    font-size: 13px;
    font-weight: 700;
  }

  .installed-app-meta {
    color: color-mix(in srgb, CanvasText 54%, transparent);
    font-size: 11px;
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
    .home-page {
      padding: 48px 16px 40px;
    }

    .installed-apps {
      grid-template-columns: 1fr;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
document.head.appendChild(style);
