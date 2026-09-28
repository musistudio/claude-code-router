/**
 * Shared runtime for the interactive docs demos: locale, the title + "tutorial
 * demo only" notice, and a VIRTUAL CURSOR used by the "Play tutorial" button.
 *
 * The play walkthroughs move a visible cursor to each real element and actually
 * click / type it (dispatching real DOM events so the unmodified UI components'
 * own handlers fire) — the user sees the mouse operate, step by step.
 */
import type { CSSProperties, ReactNode } from "react";

export type Locale = "zh" | "en";

export function readDemoLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  try {
    return new URLSearchParams(window.location.search).get("locale") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Title + notice                                                     */
/* ------------------------------------------------------------------ */

const NOTICE_TEXT: Record<Locale, string> = {
  zh: "该组件仅供教程演示。",
  en: "This component is for tutorial demonstration only.",
};

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function DemoShell({
  children,
  contentClassName,
  locale,
  onPlay,
  playing,
  title,
}: {
  children: ReactNode;
  contentClassName?: string;
  locale: Locale;
  onPlay?: () => void;
  playing?: boolean;
  title: Record<Locale, string>;
}) {
  return (
    <main className="docs-demo-shell">
      <section className="docs-demo-window" aria-label={title[locale]}>
        <DemoTitle locale={locale} title={title} onPlay={onPlay} playing={playing} />
        <DemoNotice locale={locale} />
        <div className={["docs-demo-content", contentClassName].filter(Boolean).join(" ")}>
          {children}
        </div>
      </section>
    </main>
  );
}

export function DemoTitle({
  locale,
  title,
  onPlay,
  playing,
}: {
  locale: Locale;
  title: Record<Locale, string>;
  onPlay?: () => void;
  playing?: boolean;
}) {
  const buttonLabel = playing
    ? locale === "zh" ? "播放中…" : "Playing…"
    : locale === "zh" ? "播放教程" : "Play tutorial";
  return (
    <div className="docs-demo-title">
      <div className="docs-demo-title-copy">
        {title[locale]}
      </div>
      {onPlay ? (
        <button
          type="button"
          onClick={onPlay}
          disabled={playing}
          className="docs-demo-play-button"
        >
          <PlayIcon />
          <span>{buttonLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

export function DemoNotice({ locale }: { locale: Locale }) {
  return (
    <div className="docs-demo-notice">
      <span className="docs-demo-notice-icon" aria-hidden="true">i</span>
      <span>{NOTICE_TEXT[locale]}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Virtual cursor                                                     */
/* ------------------------------------------------------------------ */

export interface CursorState {
  x: number;
  y: number;
  clicking: boolean;
  visible: boolean;
}

const MOVE_MS = 480;

export function VirtualCursor({ state }: { state: CursorState }) {
  if (!state.visible) return null;
  const cursorStyle: CSSProperties = {
    position: "fixed",
    left: state.x,
    top: state.y,
    transform: `translate(-2px,-2px) scale(${state.clicking ? 0.82 : 1})`,
    transition: `left ${MOVE_MS}ms cubic-bezier(.45,1.15,.5,1), top ${MOVE_MS}ms cubic-bezier(.45,1.15,.5,1), transform 120ms`,
    zIndex: 99999,
    pointerEvents: "none",
    willChange: "left, top",
    lineHeight: 0,
  };
  return (
    <div style={cursorStyle} aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))" }}>
        <path
          d="M4 2l16 8-7 1.6L9.5 19z"
          fill="#ffffff"
          stroke="#0f766e"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {state.clicking ? (
        <span
          style={{
            position: "absolute",
            left: -6,
            top: -6,
            width: 26,
            height: 26,
            borderRadius: "999px",
            border: "2px solid #0f766e",
            background: "rgba(15,118,110,0.18)",
          }}
        />
      ) : null}
    </div>
  );
}

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Trigger a real click via the native HTMLElement.click() method — the most
 *  reliable way to fire React onClick handlers (delegated at the root). */
function fireClick(el: Element) {
  (el as HTMLElement).click();
}

export interface CursorApi {
  moveTo(el: Element): Promise<void>;
  /** Move to the element and show a click animation WITHOUT dispatching an event
   *  (use when the action is driven by state, but you still want the visual). */
  pointAt(el: Element): Promise<void>;
  click(el: Element): Promise<void>;
  type(el: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void>;
  hide(): void;
}

export function createCursorApi(
  setCursor: (updater: (prev: CursorState) => CursorState) => void
): CursorApi {
  let rafId: number | null = null;
  let trackedEl: Element | null = null;
  let lastX = -100;
  let lastY = -100;

  /** Start a rAF loop that continuously reads the tracked element's position
   *  and updates the cursor — so even if the element moves (dialog opens,
   *  wizard advances, scroll changes) the cursor stays on target. */
  function startTracking(el: Element) {
    stopTracking();
    trackedEl = el;
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      /* not scrollable */
    }
    const tick = () => {
      if (!trackedEl || !trackedEl.isConnected) {
        rafId = null;
        return;
      }
      const r = trackedEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx !== lastX || cy !== lastY) {
        lastX = cx;
        lastY = cy;
        setCursor((c) => ({ ...c, visible: true, x: cx, y: cy }));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopTracking() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    trackedEl = null;
  }

  return {
    async moveTo(el) {
      startTracking(el);
      await sleep(MOVE_MS + 100);
    },
    async pointAt(el) {
      startTracking(el);
      await sleep(MOVE_MS + 100);
      setCursor((c) => ({ ...c, clicking: true }));
      await sleep(160);
      setCursor((c) => ({ ...c, clicking: false }));
      await sleep(140);
      stopTracking();
    },
    async click(el) {
      startTracking(el);
      await sleep(MOVE_MS + 100);
      setCursor((c) => ({ ...c, clicking: true }));
      await sleep(160);
      fireClick(el);
      await sleep(220);
      setCursor((c) => ({ ...c, clicking: false }));
      stopTracking();
    },
    async type(el, text) {
      startTracking(el);
      await sleep(MOVE_MS + 100);
      setCursor((c) => ({ ...c, clicking: true }));
      await sleep(140);
      el.focus();
      setCursor((c) => ({ ...c, clicking: false }));
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      let value = "";
      for (const ch of text) {
        value += ch;
        setter?.call(el, value);
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await sleep(55);
      }
      await sleep(180);
      stopTracking();
    },
    hide() {
      stopTracking();
      setCursor((c) => ({ ...c, visible: false }));
    },
  };
}

/* ------------------------------------------------------------------ */
/* Element finders (robust across locales)                            */
/* ------------------------------------------------------------------ */

/** First element matching `selector` whose aria-label/title matches any of `labels`
 *  (case-insensitive). Preferred over findByText for interactive controls, since
 *  their visible text is localized (and may be icon-only). */
export function findByAria(
  selector: string,
  labels: string[],
  root: ParentNode = document
): HTMLElement | null {
  const lower = labels.map((l) => l.toLowerCase());
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const a = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
    if (lower.some((s) => a === s || a.includes(s))) return el;
  }
  return null;
}

/** First element matching `selector` whose text includes any of `texts`. */
export function findByText(
  selector: string,
  texts: string[],
  root: ParentNode = document
): HTMLElement | null {
  const lower = texts.map((t) => t.toLowerCase());
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const t = (el.textContent || "").trim().toLowerCase();
    if (lower.some((s) => t === s || t.includes(s))) return el;
  }
  return null;
}

/** An input/textarea whose enclosing <label> contains any of `labelTexts`. */
export function findInputByLabels(
  labelTexts: string[],
  root: ParentNode = document
): HTMLInputElement | HTMLTextAreaElement | null {
  const lower = labelTexts.map((t) => t.toLowerCase());
  for (const label of Array.from(root.querySelectorAll("label"))) {
    const t = (label.textContent || "").toLowerCase();
    if (!lower.some((s) => t.includes(s))) continue;
    const field = label.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (field) return field;
  }
  return null;
}
