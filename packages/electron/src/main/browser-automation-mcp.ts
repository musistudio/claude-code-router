import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Event as ElectronEvent, WebContents } from "electron";
import { loadAppConfig } from "@ccr/core/config/config";
import type {
  BuiltInBrowserAutomationHandoff,
  BuiltInBrowserAutomationHandoffKind,
  BuiltInBrowserState,
  BuiltInBrowserTabState
} from "@ccr/core/contracts/app";
import type { BrowserAutomationMcpIntegration } from "@ccr/core/gateway/service";
import { BROWSER_AUTOMATION_MCP_PATH } from "@ccr/core/mcp/toolhub-config";
import { builtInBrowserService, type BrowserAutomationEvent } from "./built-in-browser";
import { chromeLoginImportService } from "./chrome-login-import";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      id: null | number | string;
      jsonrpc: "2.0";
      result: JsonValue;
    }
  | {
      error: {
        code: number;
        data?: JsonValue;
        message: string;
      };
      id: null | number | string;
      jsonrpc: "2.0";
    };

type McpTool = {
  description: string;
  inputSchema: JsonValue;
  name: string;
  tags?: string[];
  title?: string;
};

type ToolCallResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
};

type BrowserTarget = {
  axNodeId?: string;
  backendNodeId?: number;
  exact?: boolean;
  index?: number;
  ref?: string;
  role?: string;
  selector?: string;
  text?: string;
};

type BrowserSessionRef = {
  frameId?: string;
  sessionId: string;
  tabId: string;
  userId?: string;
};

type SnapshotOptions = {
  limit?: number;
  maxElements: number;
  maxText?: number;
  offset?: number;
};

type AttachedSession = {
  attachedAt: number;
  leaseId: string;
  observeOnly: boolean;
  ref: BrowserSessionRef;
};

type EventSubscription = {
  channels: Set<string>;
  dropped: boolean;
  events: BrowserAutomationEvent[];
  ref?: BrowserSessionRef;
  redactTextInput: boolean;
  sampleMouseMove: boolean;
  startedAt: number;
  subscriptionId: string;
  unsubscribe: () => void;
};

type AxSnapshotResult = {
  handoff?: BuiltInBrowserAutomationHandoff;
  handoffRequired?: boolean;
  humanHelp?: Record<string, unknown>;
  humanHelpRequired?: boolean;
  nextAction?: "human_help";
  nodes: Array<Record<string, unknown>>;
  scope: string;
  session: BrowserSessionRef;
  title: string;
  url: string;
};

type BrowserHandoffDetection = {
  kind: BuiltInBrowserAutomationHandoffKind;
  message: string;
  reason: string;
};

type ReadinessResult = {
  matched: boolean;
  matchedEvent?: string;
  navigationError?: {
    errorCode?: number;
    errorDescription?: string;
    url?: string;
  };
  readinessUrl?: string;
  timedOut: boolean;
};

type ReadinessEvent = {
  errorCode?: number;
  errorDescription?: string;
  isMainFrame?: boolean;
  type: string;
  url?: string;
};

type NavigationReadinessContext = {
  expectedUrl?: string;
  previousUrl?: string;
};

const protocolVersion = "2024-11-05";
const automationEventReplayMs = 15_000;
const defaultAxSnapshotLimit = 60;
const defaultSnapshotMaxElements = 80;
const defaultSnapshotMaxText = 3_000;
const defaultEventAwaitTimeoutMs = 10_000;
const defaultJavascriptTimeoutMs = 8_000;
const maxSnapshotTextLimit = 20_000;
const maxSnapshotTextOffset = 1_000_000_000;
const maxMcpRequestBytes = 2 * 1024 * 1024;
const maxSubscriptionEvents = 512;
const maxToolResultChars = 60_000;
const maxToolResultArrayItems = 120;
const maxToolResultStringChars = 2_000;
const maxToolResultObjectKeys = 120;
const maxSnapshotResultElements = 80;
const maxAxSnapshotResultNodes = 80;
const maxBrowserResultTextChars = maxSnapshotTextLimit;
const defaultWaitTimeoutMs = 10_000;

const sessionSchema = objectSchema({
  frameId: { description: "Optional frame id. CCR currently targets the main frame.", type: "string" },
  sessionId: { description: "Browser automation session id.", type: "string" },
  tabId: { description: "Built-in browser tab id.", type: "string" },
  userId: { description: "Optional logical user id.", type: "string" }
}, ["sessionId", "tabId"]);

const cursorSchema = objectSchema({
  dropped: { description: "Whether earlier events were dropped before this cursor.", type: "boolean" },
  seq: { description: "Last observed event sequence.", type: "number" },
  subscriptionId: { description: "Event subscription id.", type: "string" },
  ts: { description: "Last observed event timestamp.", type: "number" }
}, ["subscriptionId", "seq"]);

const targetSchema = objectSchema({
  axNodeId: { description: "Accessibility node id returned by browser_ax_snapshot/query. In CCR this is a stable element ref.", type: "string" },
  backendNodeId: { description: "Reserved for CDP-compatible clients. CSS/ref targeting is preferred in CCR.", type: "number" },
  exact: { description: "Match text/name exactly instead of by substring.", type: "boolean" },
  index: { description: "Zero-based match index when text/role resolves multiple elements.", minimum: 0, type: "number" },
  ref: { description: "Element ref returned by browser_snapshot. Refs are CSS selectors.", type: "string" },
  role: { description: "Accessible or implicit role such as button, link, textbox, combobox, checkbox.", type: "string" },
  selector: { description: "CSS selector. Used directly when provided.", type: "string" },
  text: { description: "Visible text, accessible name, placeholder, label, or value to match.", type: "string" }
});

const browserAutomationTools: McpTool[] = [
  ...browserPublicAutomationTools(),
  ...browserLegacyAliasTools()
].filter((tool, index, tools) => tools.findIndex((candidate) => candidate.name === tool.name) === index);

function browserPublicAutomationTools(): McpTool[] {
  return [
    {
      description: "Open a URL or attach an existing CCR built-in browser tab and create an automation session.",
      inputSchema: objectSchema({
        observeOnly: { description: "If true, action tools reject this session.", type: "boolean" },
        tabId: { description: "Existing tab id to attach.", type: "string" },
        timeoutMs: { description: "Optional navigation timeout in milliseconds.", type: "number" },
        url: { description: "Optional URL or search query to open.", type: "string" },
        userId: { description: "Optional logical user id.", type: "string" },
        waitUntil: { description: "Readiness condition. Default/recommended: interactive, which waits until the page is inspectable/actionable and avoids long-lived network requests. network_idle is rarely appropriate for SPAs, Google, mail, chat, auth, or streaming pages.", enum: ["none", "interactive", "domcontentloaded", "load", "network_idle"], type: "string" },
        windowId: { description: "Ignored in CCR; included for agentic-browser compatibility.", type: "string" }
      }),
      name: "browser_session_open",
      tags: ["browser", "automation", "session", "open", "tab"],
      title: "Open Browser Automation Session"
    },
    {
      description: "Detach and release a browser automation session. Does not close the tab.",
      inputSchema: objectSchema({ session: sessionSchema }, ["session"]),
      name: "browser_session_close",
      tags: ["browser", "automation", "session", "close"],
      title: "Close Browser Automation Session"
    },
    {
      description: "Create a new CCR built-in browser tab. Accepts an existing session or the fixed CCR browser window id.",
      inputSchema: objectSchema({
        activate: { description: "Whether the new tab should become active. Defaults to true.", type: "boolean" },
        session: sessionSchema,
        url: { description: "Optional URL or search query.", type: "string" },
        windowId: { description: "Ignored in CCR; included for compatibility.", type: "string" }
      }),
      name: "browser_tab_create",
      tags: ["browser", "automation", "tab", "create"],
      title: "Create Browser Tab"
    },
    {
      description: "List all CCR built-in browser tabs with active, loading, URL, title, and navigation state.",
      inputSchema: objectSchema({
        session: sessionSchema,
        windowId: { description: "Ignored in CCR; included for compatibility.", type: "string" }
      }),
      name: "browser_tab_list",
      tags: ["browser", "automation", "tab", "list"],
      title: "List Browser Tabs"
    },
    {
      description: "Activate an existing CCR built-in browser tab.",
      inputSchema: objectSchema({
        session: sessionSchema,
        tabId: { description: "Tab id to activate. Defaults to session.tabId.", type: "string" }
      }),
      name: "browser_tab_activate",
      tags: ["browser", "automation", "tab", "activate", "focus"],
      title: "Activate Browser Tab"
    },
    {
      description: "Close a CCR built-in browser tab.",
      inputSchema: objectSchema({
        session: sessionSchema,
        tabId: { description: "Tab id to close. Defaults to session.tabId.", type: "string" }
      }),
      name: "browser_tab_close",
      tags: ["browser", "automation", "tab", "close"],
      title: "Close Browser Tab"
    },
    {
      description: "Navigate the session tab or a specified tab to a URL or search query.",
      inputSchema: objectSchema({
        session: sessionSchema,
        tabId: { description: "Optional tab id. Defaults to session.tabId or active tab.", type: "string" },
        timeoutMs: { description: "Optional navigation timeout in milliseconds.", maximum: 120000, minimum: 100, type: "number" },
        url: { description: "URL or search query to load.", type: "string" },
        waitUntil: { description: "Readiness condition. Default/recommended: interactive, which waits until the page is inspectable/actionable and avoids long-lived network requests. network_idle is rarely appropriate for SPAs, Google, mail, chat, auth, or streaming pages.", enum: ["none", "interactive", "domcontentloaded", "load", "network_idle"], type: "string" }
      }, ["url"]),
      name: "browser_navigate",
      tags: ["browser", "automation", "navigate", "tab", "url"],
      title: "Navigate Browser Tab"
    },
    {
      description: "Go back in the session tab or a specified tab.",
      inputSchema: objectSchema({ session: sessionSchema, tabId: { type: "string" } }),
      name: "browser_tab_go_back",
      tags: ["browser", "automation", "tab", "back"],
      title: "Browser Tab Back"
    },
    {
      description: "Go forward in the session tab or a specified tab.",
      inputSchema: objectSchema({ session: sessionSchema, tabId: { type: "string" } }),
      name: "browser_tab_go_forward",
      tags: ["browser", "automation", "tab", "forward"],
      title: "Browser Tab Forward"
    },
    {
      description: "Reload the session tab or a specified tab.",
      inputSchema: objectSchema({ session: sessionSchema, tabId: { type: "string" } }),
      name: "browser_tab_reload",
      tags: ["browser", "automation", "tab", "reload"],
      title: "Reload Browser Tab"
    },
    {
      description: "Read a condensed accessibility-oriented page snapshot. Nodes include axNodeId/ref, role, name, value, text, and rect.",
      inputSchema: objectSchema({
        includeIgnored: { description: "Included for compatibility; CCR returns visible/high-signal nodes.", type: "boolean" },
        limit: { description: "Maximum nodes to return.", maximum: 300, minimum: 1, type: "number" },
        maxDepth: { description: "Included for compatibility.", type: "number" },
        rootAxNodeId: { description: "Optional root node/ref to scope the snapshot.", type: "string" },
        scope: { description: "full or outline. CCR returns the same compact shape for both.", enum: ["full", "outline"], type: "string" },
        session: sessionSchema
      }, ["session"]),
      name: "browser_ax_snapshot",
      tags: ["browser", "automation", "accessibility", "snapshot", "dom", "page"],
      title: "Browser Accessibility Snapshot"
    },
    {
      description: "Search the page accessibility outline by role, accessible name, visible text, label, placeholder, or value.",
      inputSchema: objectSchema({
        includeIgnored: { description: "Included for compatibility; CCR searches visible/high-signal nodes.", type: "boolean" },
        limit: { description: "Maximum matches.", maximum: 300, minimum: 1, type: "number" },
        name: { description: "Accessible name filter.", type: "string" },
        role: { description: "Role filter such as button, link, textbox, combobox.", type: "string" },
        rootAxNodeId: { description: "Optional root node/ref to scope the query.", type: "string" },
        session: sessionSchema,
        text: { description: "Visible text/value/description filter.", type: "string" }
      }, ["session"]),
      name: "browser_ax_query",
      tags: ["browser", "automation", "accessibility", "query", "find"],
      title: "Query Browser Accessibility Tree"
    },
    {
      description: "Click an element resolved by axNodeId/ref, CSS selector, role, or text.",
      inputSchema: objectSchema({ force: { type: "boolean" }, session: sessionSchema, target: targetSchema }, ["session", "target"]),
      name: "browser_element_click",
      tags: ["browser", "automation", "element", "click"],
      title: "Click Browser Element"
    },
    {
      description: "Set text into an input, textarea, contenteditable, or textbox-like element.",
      inputSchema: objectSchema({
        replace: { description: "Replace existing text. Defaults to true.", type: "boolean" },
        session: sessionSchema,
        target: targetSchema,
        text: { type: "string" }
      }, ["session", "target", "text"]),
      name: "browser_element_input",
      tags: ["browser", "automation", "element", "input", "type", "form"],
      title: "Input Browser Element"
    },
    {
      description: "Select an option on a native select by value or visible label.",
      inputSchema: objectSchema({
        exact: { type: "boolean" },
        session: sessionSchema,
        target: targetSchema,
        value: { description: "Requested option value or visible label.", type: "string" }
      }, ["session", "target", "value"]),
      name: "browser_element_select",
      tags: ["browser", "automation", "element", "select", "form"],
      title: "Select Browser Element Option"
    },
    {
      description: "Press a keyboard key against a resolved target or the current focused element.",
      inputSchema: objectSchema({
        key: { description: "Keyboard key, e.g. Enter, Tab, Escape, ArrowDown.", type: "string" },
        session: sessionSchema,
        target: targetSchema
      }, ["session", "key"]),
      name: "browser_element_press",
      tags: ["browser", "automation", "element", "press", "keyboard"],
      title: "Press Browser Element Key"
    },
    {
      description: "Scroll the page or a target element.",
      inputSchema: objectSchema({
        amount: { description: "Scroll amount in CSS pixels.", type: "number" },
        direction: { description: "Scroll direction.", enum: ["up", "down"], type: "string" },
        session: sessionSchema,
        target: targetSchema
      }, ["session"]),
      name: "browser_element_scroll",
      tags: ["browser", "automation", "element", "scroll"],
      title: "Scroll Browser Element"
    },
    {
      description: "Subscribe to browser automation events such as tab, navigation, DOM-ready, runtime, and loading signals.",
      inputSchema: objectSchema({
        channels: { description: "Event channels: tab, navigation, dom, runtime, dialog, download, input, focus, selection, handoff.", items: { type: "string" }, type: "array" },
        redactTextInput: { type: "boolean" },
        sampleMouseMove: { type: "boolean" },
        session: sessionSchema
      }, ["session", "channels"]),
      name: "browser_events_subscribe",
      tags: ["browser", "automation", "events", "subscribe"],
      title: "Subscribe Browser Events"
    },
    {
      description: "Read buffered browser automation events from a subscription.",
      inputSchema: objectSchema({
        cursor: cursorSchema,
        limit: { maximum: 200, minimum: 1, type: "number" },
        subscriptionId: { type: "string" }
      }, ["subscriptionId"]),
      name: "browser_events_read",
      tags: ["browser", "automation", "events", "read"],
      title: "Read Browser Events"
    },
    {
      description: "Wait for browser automation events matching kind, tabId, URL pattern, title pattern, or summary pattern.",
      inputSchema: objectSchema({
        coalesceMs: { description: "Small delay after a first match to collect related events.", type: "number" },
        cursor: cursorSchema,
        kinds: { items: { type: "string" }, type: "array" },
        maxEvents: { maximum: 50, minimum: 1, type: "number" },
        summaryPattern: { type: "string" },
        tabId: { type: "string" },
        timeoutMs: { maximum: 120000, minimum: 100, type: "number" },
        titlePattern: { type: "string" },
        urlPattern: { type: "string" },
        subscriptionId: { type: "string" }
      }, ["subscriptionId"]),
      name: "browser_events_await",
      tags: ["browser", "automation", "events", "await", "wait"],
      title: "Await Browser Events"
    },
    {
      description: "Unsubscribe from browser automation events and release the subscription.",
      inputSchema: objectSchema({ subscriptionId: { type: "string" } }, ["subscriptionId"]),
      name: "browser_events_unsubscribe",
      tags: ["browser", "automation", "events", "unsubscribe"],
      title: "Unsubscribe Browser Events"
    },
    {
      description: "Handle a currently open JavaScript alert/confirm/prompt dialog using Chromium CDP.",
      inputSchema: objectSchema({
        accept: { type: "boolean" },
        promptText: { type: "string" },
        session: sessionSchema
      }, ["session", "accept"]),
      name: "browser_dialog_handle",
      tags: ["browser", "automation", "dialog", "alert", "confirm", "prompt"],
      title: "Handle Browser Dialog"
    },
    {
      description: "Request human intervention for the current browser task. Shows the hidden browser window and displays the requested action in the top toolbar.",
      inputSchema: objectSchema({
        kind: {
          description: "Type of help needed.",
          enum: ["login_required", "verification_code", "human_verification", "blocked", "other"],
          type: "string"
        },
        message: { description: "Short instruction shown in the top toolbar.", type: "string" },
        reason: { description: "Why automation is blocked.", type: "string" },
        session: sessionSchema,
        tabId: { description: "Optional tab id. Defaults to session.tabId or active tab.", type: "string" }
      }, ["reason"]),
      name: "browser_handoff_request",
      tags: ["browser", "automation", "human", "handoff", "intervention"],
      title: "Request Browser Human Handoff"
    },
    {
      description: "Read the current browser human handoff status.",
      inputSchema: objectSchema({}),
      name: "browser_handoff_status",
      tags: ["browser", "automation", "human", "handoff"],
      title: "Browser Handoff Status"
    },
    {
      description: "Wait until the user clicks Done or Hide on the current browser handoff toolbar. Use after browser_handoff_request or a tool result with humanHelpRequired.",
      inputSchema: objectSchema({
        handoffId: { description: "Optional handoff id returned by browser_handoff_request or humanHelp.handoff.", type: "string" },
        session: sessionSchema,
        tabId: { description: "Optional tab id. Defaults to session.tabId.", type: "string" },
        timeoutMs: { description: "Maximum wait time in milliseconds.", maximum: 600000, minimum: 100, type: "number" }
      }),
      name: "browser_handoff_wait",
      tags: ["browser", "automation", "human", "handoff", "wait"],
      title: "Wait For Browser Human Handoff"
    },
    {
      description: "Clear the current browser human handoff prompt.",
      inputSchema: objectSchema({
        status: { enum: ["completed", "dismissed"], type: "string" }
      }),
      name: "browser_handoff_clear",
      tags: ["browser", "automation", "human", "handoff"],
      title: "Clear Browser Handoff"
    },
    {
      description: "Ask the user to confirm importing Chrome cookies and localStorage for selected domains into CCR's in-app browser. Opens a browser confirmation page; the Chrome extension performs the import after user confirmation.",
      inputSchema: objectSchema({
        domain: { description: "Single domain to import, such as github.com. Used with domains if both are provided.", type: "string" },
        domains: { description: "Domains to import. If omitted, CCR derives the current tab hostname.", items: { type: "string" }, type: "array" },
        openConfirmationPage: { description: "Open the system browser confirmation page. Defaults to true.", type: "boolean" },
        session: sessionSchema,
        tabId: { description: "Optional tab id used to derive a domain when domain/domains are omitted.", type: "string" },
        target: { description: "Target CCR browser storage partition.", enum: ["browser", "browser-and-web-search"], type: "string" }
      }),
      name: "browser_chrome_login_import",
      tags: ["browser", "automation", "chrome", "login", "import", "cookies", "localStorage"],
      title: "Import Chrome Login State"
    },
    {
      description: "Read the status of a Chrome login import job created by browser_chrome_login_import.",
      inputSchema: objectSchema({
        jobId: { description: "Chrome login import job id.", type: "string" }
      }, ["jobId"]),
      name: "browser_chrome_login_import_status",
      tags: ["browser", "automation", "chrome", "login", "import", "status"],
      title: "Chrome Login Import Status"
    }
  ];
}

function browserLegacyAliasTools(): McpTool[] {
  return [
  {
    description: "Open or focus the CCR built-in browser window. Optionally navigate the active tab to a URL.",
    inputSchema: objectSchema({
      url: { description: "Optional URL or search query to load in the active tab.", type: "string" }
    }),
    name: "browser_open",
    tags: ["browser", "automation", "open", "focus"],
    title: "Open Browser"
  },
  {
    description: "List CCR built-in browser tabs, including active tab, URL, title, and loading state.",
    inputSchema: objectSchema({}),
    name: "browser_tabs",
    tags: ["browser", "automation", "tabs"],
    title: "List Browser Tabs"
  },
  {
    description: "Open a new CCR built-in browser tab. Optionally load a URL or search query.",
    inputSchema: objectSchema({
      url: { description: "Optional URL or search query to load in the new tab.", type: "string" }
    }),
    name: "browser_tab_new",
    tags: ["browser", "automation", "tab"],
    title: "New Browser Tab"
  },
  {
    description: "Focus a CCR built-in browser tab by tabId.",
    inputSchema: objectSchema({
      tabId: { description: "Tab id returned by browser_tabs or browser_tab_new.", type: "string" }
    }, ["tabId"]),
    name: "browser_tab_activate",
    tags: ["browser", "automation", "tab", "focus"],
    title: "Activate Browser Tab"
  },
  {
    description: "Close a CCR built-in browser tab by tabId.",
    inputSchema: objectSchema({
      tabId: { description: "Tab id returned by browser_tabs or browser_tab_new.", type: "string" }
    }, ["tabId"]),
    name: "browser_tab_close",
    tags: ["browser", "automation", "tab"],
    title: "Close Browser Tab"
  },
  {
    description: "Navigate a CCR built-in browser tab to a URL or search query.",
    inputSchema: objectSchema({
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      url: { description: "URL or search query to load.", type: "string" }
    }, ["url"]),
    name: "browser_navigate",
    tags: ["browser", "automation", "navigate", "url"],
    title: "Navigate Browser"
  },
  {
    description: "Capture page text plus interactable element refs for browser automation. Use returned refs for browser_click, browser_type, browser_select, browser_press_key, or browser_scroll.",
    inputSchema: objectSchema({
      limit: { description: "Maximum page text characters to include. Overrides maxText when both are provided.", maximum: maxSnapshotTextLimit, minimum: 0, type: "number" },
      maxElements: { description: "Maximum interactable elements to include.", maximum: 300, minimum: 1, type: "number" },
      maxText: { description: "Legacy alias for limit.", maximum: maxSnapshotTextLimit, minimum: 0, type: "number" },
      offset: { description: "Starting character offset into the normalized page text.", maximum: maxSnapshotTextOffset, minimum: 0, type: "number" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" }
    }),
    name: "browser_snapshot",
    tags: ["browser", "automation", "snapshot", "accessibility", "dom", "page"],
    title: "Browser Page Snapshot"
  },
  {
    description: "Click an element in the CCR built-in browser by ref, CSS selector, role, or visible text.",
    inputSchema: objectSchema({
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      target: targetSchema
    }, ["target"]),
    name: "browser_click",
    tags: ["browser", "automation", "click", "element"],
    title: "Click Browser Element"
  },
  {
    description: "Type text into an input, textarea, select-like textbox, or contenteditable element in the CCR built-in browser.",
    inputSchema: objectSchema({
      replaceExisting: { description: "Replace existing text. Defaults to true.", type: "boolean" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      target: targetSchema,
      text: { description: "Text to type.", type: "string" }
    }, ["target", "text"]),
    name: "browser_type",
    tags: ["browser", "automation", "type", "input", "form"],
    title: "Type In Browser Element"
  },
  {
    description: "Choose an option in a select element by value or visible label.",
    inputSchema: objectSchema({
      exact: { description: "Match label exactly instead of by substring.", type: "boolean" },
      label: { description: "Visible option label to choose.", type: "string" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      target: targetSchema,
      value: { description: "Option value to choose.", type: "string" }
    }, ["target"]),
    name: "browser_select",
    tags: ["browser", "automation", "select", "form"],
    title: "Select Browser Option"
  },
  {
    description: "Press a keyboard key in the CCR built-in browser. Optionally focus an element first.",
    inputSchema: objectSchema({
      key: { description: "Electron keyCode, for example Enter, Tab, Escape, Backspace, ArrowDown.", type: "string" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      target: targetSchema
    }, ["key"]),
    name: "browser_press_key",
    tags: ["browser", "automation", "keyboard", "press"],
    title: "Press Browser Key"
  },
  {
    description: "Scroll the page or a target element in the CCR built-in browser.",
    inputSchema: objectSchema({
      deltaX: { description: "Horizontal scroll delta in pixels.", type: "number" },
      deltaY: { description: "Vertical scroll delta in pixels.", type: "number" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      target: targetSchema
    }),
    name: "browser_scroll",
    tags: ["browser", "automation", "scroll"],
    title: "Scroll Browser"
  },
  {
    description: "Wait until a browser page condition is true: URL includes/matches, selector is visible, or text is visible.",
    inputSchema: objectSchema({
      selector: { description: "CSS selector that must be visible.", type: "string" },
      tabId: { description: "Optional tab id. Defaults to the active tab.", type: "string" },
      text: { description: "Text that must be visible in document body.", type: "string" },
      timeoutMs: { description: "Maximum wait time in milliseconds.", maximum: 120000, minimum: 100, type: "number" },
      urlIncludes: { description: "Substring that must appear in the URL.", type: "string" },
      urlMatches: { description: "JavaScript regular expression that must match the URL.", type: "string" }
    }),
    name: "browser_wait_for",
    tags: ["browser", "automation", "wait", "url", "selector", "text"],
    title: "Wait For Browser Page"
  },
  {
    description: "Agentic-browser-compatible alias for browser_handoff_request. Request human help for login, verification, CAPTCHA, or other manual-only blockers.",
    inputSchema: objectSchema({
      browserSessionId: { type: "string" },
      kind: { enum: ["login_required", "verification_code", "human_verification", "blocked", "other"], type: "string" },
      message: { type: "string" },
      reason: { type: "string" },
      tabId: { type: "string" }
    }, ["reason", "kind"]),
    name: "askHumanHelp",
    tags: ["browser", "automation", "human", "handoff", "intervention"],
    title: "Ask Human Help"
  }
  ];
}

class BrowserAutomationMcpService implements BrowserAutomationMcpIntegration {
  private readonly sessions = new Map<string, AttachedSession>();
  private readonly subscriptions = new Map<string, EventSubscription>();

  async handleBrowserAutomationMcpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("MCP-Protocol-Version", protocolVersion);
    const path = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/";

    if (request.method === "GET" && (path === BROWSER_AUTOMATION_MCP_PATH || path === `${BROWSER_AUTOMATION_MCP_PATH}/`)) {
      sendJson(response, 200, {
        endpoint: BROWSER_AUTOMATION_MCP_PATH,
        name: "ccr-browser-automation",
        protocol: "mcp",
        transport: "streamable-http"
      });
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Browser automation MCP endpoint only supports GET and POST." } });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readRequestBody(request, maxMcpRequestBytes)).toString("utf8")) as unknown;
    } catch (error) {
      sendJson(response, 400, jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      return;
    }

    const requests = Array.isArray(payload) ? payload : [payload];
    const responses = await Promise.all(requests.map((item) => this.handleJsonRpcRequest(item)));
    const filtered = responses.filter((item): item is JsonRpcResponse => Boolean(item));
    if (filtered.length === 0) {
      response.writeHead(204);
      response.end();
      return;
    }

    sendJson(response, 200, Array.isArray(payload) ? filtered : filtered[0]);
  }

  async stopBrowserAutomationMcpServer(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    this.sessions.clear();
    // The gateway owns this MCP route. Browser tabs remain user-visible state and are
    // intentionally not closed when the gateway restarts.
  }

  private async handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
    if (!isRecord(payload)) {
      return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
    }

    const request = payload as JsonRpcRequest;
    const id = request.id ?? null;
    if (request.id === undefined && request.method?.startsWith("notifications/")) {
      return undefined;
    }
    if (request.jsonrpc !== "2.0" || !request.method) {
      return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
    }

    try {
      switch (request.method) {
        case "initialize":
          return jsonRpcResult(id, {
            capabilities: {
              tools: {}
            },
            protocolVersion,
            serverInfo: {
              name: "ccr-browser-automation",
              title: "CCR Browser Automation",
              version: "1.0.0"
            }
          });
        case "ping":
          return jsonRpcResult(id, {});
        case "tools/list":
          return jsonRpcResult(id, { tools: browserAutomationTools as unknown as JsonValue });
        case "tools/call":
          return jsonRpcResult(id, await this.callTool(request.params) as unknown as JsonValue);
        default:
          return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
      }
    } catch (error) {
      return jsonRpcError(id, -32603, formatError(error));
    }
  }

  private async callTool(params: unknown): Promise<ToolCallResult> {
    if (!isRecord(params) || typeof params.name !== "string") {
      throw new Error("tools/call params must include a tool name.");
    }
    const args = isRecord(params.arguments) ? params.arguments : {};
    try {
      const result = await this.runTool(params.name, args);
      return textResult(formatToolResult(params.name, result));
    } catch (error) {
      return {
        ...textResult(formatError(error)),
        isError: true
      };
    }
  }

  private async runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "browser_session_open":
        return await this.openSession(args);
      case "browser_session_close":
        return this.closeSession(args);
      case "browser_tab_create":
        return await this.createTab(args);
      case "browser_tab_list":
        await this.ensureBrowserOpen();
        return browserWindowState();
      case "browser_tab_activate": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        const tabId = readString(args.tabId) || session?.ref.tabId;
        if (!tabId) {
          throw new Error("browser_tab_activate requires tabId or session.");
        }
        const state = builtInBrowserService.selectAutomationTab(tabId);
        return {
          ...browserWindowState(state),
          tab: summarizeTab(requiredTabState(state, tabId), state.activeTabId)
        };
      }
      case "browser_tab_close": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        this.assertCanMutate(session);
        const tabId = readString(args.tabId) || session?.ref.tabId;
        if (!tabId) {
          throw new Error("browser_tab_close requires tabId or session.");
        }
        const state = builtInBrowserService.closeAutomationTab(tabId);
        this.removeSessionsForTab(tabId);
        return browserWindowState(state);
      }
      case "browser_navigate": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        this.assertCanMutate(session);
        const tabId = readString(args.tabId) || session?.ref.tabId || builtInBrowserService.getAutomationState().activeTabId;
        if (!tabId) {
          throw new Error("browser_navigate could not resolve an active tab.");
        }
        const url = requiredString(args.url, "browser_navigate requires url.");
        const waitUntil = normalizeWaitUntil(readString(args.waitUntil), "interactive");
        const readiness = await waitForReadiness(
          builtInBrowserService.getAutomationWebContents(tabId),
          waitUntil,
          clampInteger(readNumber(args.timeoutMs) ?? defaultWaitTimeoutMs, 100, 120000),
          () => builtInBrowserService.navigateAutomationTab(url, tabId),
          url
        );
        const state = builtInBrowserService.getAutomationState();
        const webContents = builtInBrowserService.getAutomationWebContents(tabId);
        const handoff = await maybeRequestHandoffAfterNavigation(webContents, readiness, {
          requestedUrl: url,
          session: session?.ref,
          tabId,
          waitUntil
        });
        return {
          ...browserWindowState(state),
          ...(handoff ? humanHelpResultFields(handoff) : {}),
          session: session?.ref,
          tab: summarizeTab(requiredTabState(state, tabId), state.activeTabId),
          ...readiness
        };
      }
      case "browser_tab_go_back": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        this.assertCanMutate(session);
        return browserWindowState(builtInBrowserService.goBackAutomationTab(readString(args.tabId) || session?.ref.tabId));
      }
      case "browser_tab_go_forward": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        this.assertCanMutate(session);
        return browserWindowState(builtInBrowserService.goForwardAutomationTab(readString(args.tabId) || session?.ref.tabId));
      }
      case "browser_tab_reload": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        this.assertCanMutate(session);
        return browserWindowState(builtInBrowserService.reloadAutomationTab(readString(args.tabId) || session?.ref.tabId));
      }
      case "browser_ax_snapshot": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        return await captureAxSnapshot(
          builtInBrowserService.getAutomationWebContents(session.ref.tabId),
          session.ref,
          {
            limit: clampInteger(readNumber(args.limit) ?? defaultAxSnapshotLimit, 1, 300),
            rootAxNodeId: readString(args.rootAxNodeId),
            scope: readString(args.scope) === "outline" ? "outline" : "full"
          }
        );
      }
      case "browser_ax_query": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        return await queryAxSnapshot(
          builtInBrowserService.getAutomationWebContents(session.ref.tabId),
          session.ref,
          {
            limit: clampInteger(readNumber(args.limit) ?? 50, 1, 300),
            name: readString(args.name),
            role: readString(args.role),
            rootAxNodeId: readString(args.rootAxNodeId),
            text: readString(args.text)
          }
        );
      }
      case "browser_element_click": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        const result = await runTargetAction(webContents, "click", readTarget(args.target));
        return await pageActionResult(webContents, session.ref, "click", result);
      }
      case "browser_element_input": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        const result = await runTargetAction(webContents, "type", readTarget(args.target), {
          replaceExisting: args.replace !== false,
          text: typeof args.text === "string" ? args.text : ""
        });
        return await pageActionResult(webContents, session.ref, "input", result);
      }
      case "browser_element_select": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const value = requiredString(args.value, "browser_element_select requires value.");
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        const result = await runTargetAction(webContents, "select", readTarget(args.target), {
          exact: args.exact === true,
          label: value,
          value
        });
        return await pageActionResult(webContents, session.ref, "select", result);
      }
      case "browser_element_press": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        const result = await pressKey(
          webContents,
          requiredString(args.key, "browser_element_press requires key."),
          isRecord(args.target) ? readTarget(args.target) : undefined
        );
        return await pageActionResult(webContents, session.ref, "press", result);
      }
      case "browser_element_scroll": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const amount = Math.abs(readNumber(args.amount) ?? 700);
        const direction = readString(args.direction) === "up" ? "up" : "down";
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        const result = await runTargetAction(
          webContents,
          "scroll",
          isRecord(args.target) ? readTarget(args.target) : undefined,
          {
            deltaX: 0,
            deltaY: direction === "up" ? -amount : amount
          }
        );
        return await pageActionResult(webContents, session.ref, "scroll", result);
      }
      case "browser_events_subscribe":
        await this.ensureBrowserOpen();
        return this.subscribeEvents(args);
      case "browser_events_read":
        return this.readEvents(args);
      case "browser_events_await":
        return await this.awaitEvents(args);
      case "browser_events_unsubscribe":
        return this.unsubscribeEvents(args);
      case "browser_dialog_handle": {
        await this.ensureBrowserOpen();
        const session = this.requireSession(args);
        this.assertCanMutate(session);
        const webContents = builtInBrowserService.getAutomationWebContents(session.ref.tabId);
        return await handleJavaScriptDialog(webContents, args.accept === true, readString(args.promptText), session.ref);
      }
      case "browser_handoff_request":
      case "askHumanHelp":
        await this.ensureBrowserOpen();
        return this.requestHandoff(args);
      case "browser_handoff_status":
        await this.ensureBrowserOpen();
        return {
          handoff: builtInBrowserService.getAutomationState().automationHandoff,
          state: browserWindowState()
        };
      case "browser_handoff_wait":
        await this.ensureBrowserOpen();
        return await this.waitForHandoff(args);
      case "browser_handoff_clear":
        return {
          handoff: undefined,
          state: builtInBrowserService.resolveAutomationHandoff(readString(args.status) === "dismissed" ? "dismissed" : "completed")
        };
      case "browser_chrome_login_import": {
        await this.ensureBrowserOpen();
        const session = this.resolveOptionalSession(args);
        const domains = resolveChromeLoginImportDomains(args, session?.ref.tabId);
        const job = await chromeLoginImportService.createJob({
          domains,
          openConfirmationPage: args.openConfirmationPage !== false,
          target: readString(args.target) === "browser-and-web-search" ? "browser-and-web-search" : "browser"
        });
        return {
          humanHelpRequired: true,
          job,
          nextAction: "user_confirm_chrome_import",
          state: browserWindowState(),
          summary: `Opened Chrome login import confirmation for ${job.domains.join(", ")}.`
        };
      }
      case "browser_chrome_login_import_status": {
        const jobId = requiredString(args.jobId, "browser_chrome_login_import_status requires jobId.");
        const job = chromeLoginImportService.getJob(jobId);
        if (!job) {
          throw new Error(`Chrome login import job was not found: ${jobId}`);
        }
        return { job };
      }
      case "browser_open": {
        const state = await this.ensureBrowserVisible();
        const url = readString(args.url);
        return url ? await builtInBrowserService.navigateAutomationTab(url, state.activeTabId) : builtInBrowserService.getAutomationState();
      }
      case "browser_tabs":
        await this.ensureBrowserOpen();
        return builtInBrowserService.getAutomationState();
      case "browser_tab_new": {
        await this.ensureBrowserOpen();
        const tab = builtInBrowserService.createAutomationTab(readString(args.url) || undefined);
        return { state: builtInBrowserService.getAutomationState(), tab };
      }
      case "browser_snapshot":
        await this.ensureBrowserOpen();
        return await captureSnapshotWithHandoff(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          readString(args.tabId),
          {
            limit: clampInteger(readNumber(args.limit) ?? readNumber(args.maxText) ?? defaultSnapshotMaxText, 0, maxSnapshotTextLimit),
            maxElements: clampInteger(readNumber(args.maxElements) ?? defaultSnapshotMaxElements, 1, 300),
            offset: clampInteger(readNumber(args.offset) ?? 0, 0, maxSnapshotTextOffset)
          }
        );
      case "browser_click":
        await this.ensureBrowserOpen();
        return await runTargetAction(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          "click",
          readTarget(args.target)
        );
      case "browser_type":
        await this.ensureBrowserOpen();
        return await runTargetAction(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          "type",
          readTarget(args.target),
          {
            replaceExisting: args.replaceExisting !== false,
            text: typeof args.text === "string" ? args.text : ""
          }
        );
      case "browser_select":
        await this.ensureBrowserOpen();
        return await runTargetAction(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          "select",
          readTarget(args.target),
          {
            exact: args.exact === true,
            label: readString(args.label),
            value: readString(args.value)
          }
        );
      case "browser_press_key":
        await this.ensureBrowserOpen();
        return await pressKey(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          requiredString(args.key, "browser_press_key requires key."),
          isRecord(args.target) ? readTarget(args.target) : undefined
        );
      case "browser_scroll":
        await this.ensureBrowserOpen();
        return await runTargetAction(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          "scroll",
          isRecord(args.target) ? readTarget(args.target) : undefined,
          {
            deltaX: readNumber(args.deltaX) ?? 0,
            deltaY: readNumber(args.deltaY) ?? 700
          }
        );
      case "browser_wait_for":
        await this.ensureBrowserOpen();
        return await waitForPageCondition(
          builtInBrowserService.getAutomationWebContents(readString(args.tabId)),
          {
            selector: readString(args.selector),
            text: readString(args.text),
            timeoutMs: clampInteger(readNumber(args.timeoutMs) ?? defaultWaitTimeoutMs, 100, 120000),
            urlIncludes: readString(args.urlIncludes),
            urlMatches: readString(args.urlMatches)
          }
        );
      default:
        throw new Error(`Unknown browser automation tool: ${name}`);
    }
  }

  private async ensureBrowserOpen(): Promise<BuiltInBrowserState> {
    await builtInBrowserService.openHidden(await loadAppConfig());
    return builtInBrowserService.getAutomationState();
  }

  private async ensureBrowserVisible(): Promise<BuiltInBrowserState> {
    await builtInBrowserService.open(await loadAppConfig());
    return builtInBrowserService.getAutomationState();
  }

  private async openSession(args: Record<string, unknown>): Promise<unknown> {
    let state = await this.ensureBrowserOpen();
    const url = readString(args.url);
    const requestedTabId = readString(args.tabId);
    const previousActiveTabId = state.activeTabId;
    let tabId = requestedTabId;
    let createdTab = false;

    if (tabId && !state.tabs.some((tab) => tab.id === tabId)) {
      throw new Error(`Browser tab was not found: ${tabId}`);
    }

    if (!tabId && url) {
      const tab = builtInBrowserService.createAutomationTab();
      tabId = tab.id;
      createdTab = true;
    } else if (!tabId) {
      tabId = state.activeTabId || builtInBrowserService.createAutomationTab().id;
      createdTab = !state.activeTabId;
    } else if (state.activeTabId !== tabId) {
      builtInBrowserService.selectAutomationTab(tabId);
    }

    if (!tabId) {
      throw new Error("Unable to resolve browser tab for automation session.");
    }

    const waitUntil = normalizeWaitUntil(readString(args.waitUntil), url ? "interactive" : "none");
    const timeoutMs = clampInteger(readNumber(args.timeoutMs) ?? defaultWaitTimeoutMs, 100, 120000);
    const webContents = builtInBrowserService.getAutomationWebContents(tabId);
    const readiness = await waitForReadiness(
      webContents,
      waitUntil,
      timeoutMs,
      url ? () => builtInBrowserService.navigateAutomationTab(url, tabId) : undefined,
      url
    );
    state = builtInBrowserService.getAutomationState();
    const tab = requiredTabState(state, tabId);
    const ref: BrowserSessionRef = {
      sessionId: randomUUID(),
      tabId,
      ...(readString(args.userId) ? { userId: readString(args.userId) } : {})
    };
    const attached: AttachedSession = {
      attachedAt: Date.now(),
      leaseId: randomUUID(),
      observeOnly: args.observeOnly === true,
      ref
    };
    this.sessions.set(ref.sessionId, attached);
    const handoff = await maybeRequestHandoffAfterNavigation(webContents, readiness, {
      requestedUrl: url,
      session: ref,
      tabId,
      waitUntil
    });

    return {
      session: ref,
      attachedAt: attached.attachedAt,
      createdTab,
      ...(handoff ? humanHelpResultFields(handoff) : {}),
      matched: readiness.matched,
      matchedEvent: readiness.matchedEvent,
      ...(readiness.navigationError ? { navigationError: readiness.navigationError } : {}),
      previousActiveTabId,
      readinessUrl: readiness.readinessUrl,
      tabId,
      timedOut: readiness.timedOut,
      title: tab.title,
      url: tab.url,
      waitUntil,
      windowId: builtInBrowserService.getAutomationWindowId()
    };
  }

  private closeSession(args: Record<string, unknown>): unknown {
    const session = this.requireSession(args);
    this.sessions.delete(session.ref.sessionId);
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (subscription.ref?.sessionId === session.ref.sessionId) {
        subscription.unsubscribe();
        this.subscriptions.delete(subscriptionId);
      }
    }
    return { success: true };
  }

  private async createTab(args: Record<string, unknown>): Promise<unknown> {
    const state = await this.ensureBrowserOpen();
    const session = this.resolveOptionalSession(args);
    this.assertCanMutate(session);
    const previousActiveTabId = state.activeTabId;
    const tab = builtInBrowserService.createAutomationTab(readString(args.url) || undefined);
    if (args.activate === false && previousActiveTabId) {
      builtInBrowserService.selectAutomationTab(previousActiveTabId);
    }
    const nextState = builtInBrowserService.getAutomationState();
    return summarizeTab(requiredTabState(nextState, tab.id), nextState.activeTabId);
  }

  private requireSession(args: Record<string, unknown>): AttachedSession {
    const session = this.resolveOptionalSession(args);
    if (!session) {
      throw new Error("A valid browser automation session is required.");
    }
    return session;
  }

  private resolveOptionalSession(args: Record<string, unknown>): AttachedSession | undefined {
    const ref = readSessionRef(args.session);
    if (!ref) {
      return undefined;
    }
    const existing = this.sessions.get(ref.sessionId);
    if (existing) {
      if (existing.ref.tabId !== ref.tabId) {
        throw new Error("Browser automation session tabId does not match the attached session.");
      }
      return existing;
    }
    const state = builtInBrowserService.getAutomationState();
    if (!state.tabs.some((tab) => tab.id === ref.tabId)) {
      throw new Error(`Browser automation session tab was not found: ${ref.tabId}`);
    }
    const restored: AttachedSession = {
      attachedAt: Date.now(),
      leaseId: randomUUID(),
      observeOnly: false,
      ref
    };
    this.sessions.set(ref.sessionId, restored);
    return restored;
  }

  private assertCanMutate(session?: AttachedSession): void {
    if (session?.observeOnly) {
      throw new Error("This browser automation session is observeOnly and cannot mutate browser state.");
    }
  }

  private removeSessionsForTab(tabId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.ref.tabId === tabId) {
        this.sessions.delete(sessionId);
      }
    }
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (subscription.ref?.tabId === tabId) {
        subscription.unsubscribe();
        this.subscriptions.delete(subscriptionId);
      }
    }
  }

  private subscribeEvents(args: Record<string, unknown>): unknown {
    const session = this.requireSession(args);
    const channels = normalizeEventChannels(readStringArray(args.channels));
    const subscription: EventSubscription = {
      channels,
      dropped: false,
      events: [],
      ref: session.ref,
      redactTextInput: args.redactTextInput !== false,
      sampleMouseMove: args.sampleMouseMove === true,
      startedAt: Date.now(),
      subscriptionId: randomUUID(),
      unsubscribe: () => undefined
    };
    const listener = (event: BrowserAutomationEvent) => {
      if (!matchesSubscriptionEvent(subscription, event)) {
        return;
      }
      subscription.events.push(event);
      if (subscription.events.length > maxSubscriptionEvents) {
        subscription.events.splice(0, subscription.events.length - maxSubscriptionEvents);
        subscription.dropped = true;
      }
    };
    subscription.unsubscribe = builtInBrowserService.subscribeAutomationEvents(listener, {
      replayRecentMs: automationEventReplayMs
    });
    this.subscriptions.set(subscription.subscriptionId, subscription);

    return {
      subscription: subscriptionDescriptor(subscription)
    };
  }

  private readEvents(args: Record<string, unknown>): unknown {
    const subscription = this.requireSubscription(args);
    const limit = clampInteger(readNumber(args.limit) ?? 100, 1, 200);
    const cursorSeq = readCursorSeq(args.cursor);
    const events = eventsAfterCursor(subscription, cursorSeq).slice(0, limit);
    return {
      dropped: subscription.dropped || cursorDropped(subscription, cursorSeq),
      events,
      nextCursor: makeEventCursor(subscription, events.at(-1)?.seq ?? cursorSeq),
      subscriptionId: subscription.subscriptionId
    };
  }

  private async awaitEvents(args: Record<string, unknown>): Promise<unknown> {
    const subscription = this.requireSubscription(args);
    const timeoutMs = clampInteger(readNumber(args.timeoutMs) ?? defaultEventAwaitTimeoutMs, 100, 120000);
    const maxEvents = clampInteger(readNumber(args.maxEvents) ?? 10, 1, 50);
    const coalesceMs = clampInteger(readNumber(args.coalesceMs) ?? 100, 0, 2000);
    const cursorSeq = readCursorSeq(args.cursor);
    const deadline = Date.now() + timeoutMs;
    let matched: BrowserAutomationEvent[] = [];

    while (Date.now() <= deadline) {
      matched = eventsAfterCursor(subscription, cursorSeq)
        .filter((event) => matchesAwaitFilter(event, args))
        .slice(0, maxEvents);
      if (matched.length > 0) {
        if (coalesceMs > 0) {
          await sleep(coalesceMs);
          matched = eventsAfterCursor(subscription, cursorSeq)
            .filter((event) => matchesAwaitFilter(event, args))
            .slice(0, maxEvents);
        }
        break;
      }
      await sleep(100);
    }

    return {
      dropped: subscription.dropped || cursorDropped(subscription, cursorSeq),
      event: matched[0],
      events: matched,
      matched: matched.length > 0,
      nextCursor: makeEventCursor(subscription, matched.at(-1)?.seq ?? cursorSeq),
      subscriptionId: subscription.subscriptionId,
      timedOut: matched.length === 0
    };
  }

  private unsubscribeEvents(args: Record<string, unknown>): unknown {
    const subscription = this.requireSubscription(args);
    subscription.unsubscribe();
    this.subscriptions.delete(subscription.subscriptionId);
    return {
      ok: true,
      subscriptionId: subscription.subscriptionId
    };
  }

  private requireSubscription(args: Record<string, unknown>): EventSubscription {
    const subscriptionId = requiredString(args.subscriptionId, "Browser event subscriptionId is required.");
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Browser event subscription was not found: ${subscriptionId}`);
    }
    return subscription;
  }

  private requestHandoff(args: Record<string, unknown>): unknown {
    const session = this.resolveOptionalSession(args);
    const sessionId = session?.ref.sessionId || readString(args.browserSessionId);
    const tabId = readString(args.tabId) || session?.ref.tabId;
    const handoff = builtInBrowserService.requestAutomationHandoff({
      kind: readHandoffKind(args.kind),
      message: readString(args.message),
      reason: requiredString(args.reason, "browser_handoff_request requires reason."),
      sessionId,
      tabId
    });
    return {
      ...humanHelpResultFields(handoff),
      state: browserWindowState()
    };
  }

  private async waitForHandoff(args: Record<string, unknown>): Promise<unknown> {
    const session = this.resolveOptionalSession(args);
    const handoffId = readString(args.handoffId);
    const tabId = readString(args.tabId) || session?.ref.tabId;
    const timeoutMs = clampInteger(readNumber(args.timeoutMs) ?? 300000, 100, 600000);

    const current = builtInBrowserService.getAutomationState().automationHandoff;
    if (!handoffMatches(current, { handoffId, tabId })) {
      const recentResolution = findRecentHandoffResolution({ handoffId, tabId });
      if (recentResolution) {
        return handoffResolutionResult(recentResolution, undefined, false);
      }
      return {
        handoff: current,
        matched: false,
        reason: current ? "A browser handoff is pending, but it does not match the requested handoffId/tabId." : "No browser handoff is currently pending.",
        state: browserWindowState(),
        timedOut: false
      };
    }

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result: Record<string, unknown>) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(result);
      };
      const unsubscribe = builtInBrowserService.subscribeAutomationEvents((event) => {
        if (event.kind !== "handoff.completed" && event.kind !== "handoff.dismissed") {
          return;
        }
        if (handoffId && event.handoffId !== handoffId) {
          return;
        }
        if (tabId && event.tabId !== tabId) {
          return;
        }
        finish(handoffResolutionResult(event, current, false));
      });
      const timer = setTimeout(() => {
        finish({
          handoff: current,
          matched: false,
          state: browserWindowState(),
          timedOut: true
        });
      }, timeoutMs);
    });
  }
}

export const browserAutomationMcpService = new BrowserAutomationMcpService();

function browserWindowState(state = builtInBrowserService.getAutomationState()): Record<string, unknown> {
  return {
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => summarizeTab(tab, state.activeTabId)),
    windowId: builtInBrowserService.getAutomationWindowId()
  };
}

function resolveChromeLoginImportDomains(args: Record<string, unknown>, fallbackTabId?: string): string[] {
  const explicit = uniqueStrings([
    ...readStringArray(args.domains),
    ...(readString(args.domain) ? [readString(args.domain) as string] : [])
  ].map(normalizeChromeLoginImportDomain).filter((domain): domain is string => Boolean(domain)));
  if (explicit.length > 0) {
    return explicit;
  }

  const state = builtInBrowserService.getAutomationState();
  const tabId = readString(args.tabId) || fallbackTabId || state.activeTabId;
  const tab = state.tabs.find((candidate) => candidate.id === tabId) || state.tabs.find((candidate) => candidate.id === state.activeTabId);
  const domain = normalizeChromeLoginImportDomain(tab?.url);
  if (!domain) {
    throw new Error("browser_chrome_login_import requires domains or an active http(s) tab.");
  }
  return [domain];
}

function normalizeChromeLoginImportDomain(value: unknown): string | undefined {
  const raw = readString(value)?.toLowerCase();
  if (!raw) {
    return undefined;
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^\*\./, "").replace(/^\./, "");
  } catch {
    const domain = raw.replace(/^\*\./, "").replace(/^\./, "").split("/")[0];
    return domain && !domain.includes(" ") ? domain : undefined;
  }
}

function summarizeTab(tab: BuiltInBrowserTabState, activeTabId?: string): Record<string, unknown> {
  return {
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward,
    displayUrl: tab.url,
    isActive: tab.id === activeTabId,
    isLoading: tab.isLoading,
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    windowId: builtInBrowserService.getAutomationWindowId()
  };
}

function requiredTabState(state: BuiltInBrowserState, tabId: string): BuiltInBrowserTabState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    throw new Error(`Browser tab was not found: ${tabId}`);
  }
  return tab;
}

function readSessionRef(value: unknown): BrowserSessionRef | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sessionId = readString(value.sessionId);
  const tabId = readString(value.tabId);
  if (!sessionId || !tabId) {
    return undefined;
  }
  return {
    sessionId,
    tabId,
    ...(readString(value.frameId) ? { frameId: readString(value.frameId) } : {}),
    ...(readString(value.userId) ? { userId: readString(value.userId) } : {})
  };
}

async function pageActionResult(
  webContents: WebContents,
  session: BrowserSessionRef,
  action: string,
  result: unknown
): Promise<Record<string, unknown>> {
  const handoff = await maybeRequestPageHandoff(webContents, {
    session,
    tabId: session.tabId
  });
  return {
    action,
    ...(handoff ? humanHelpResultFields(handoff) : {}),
    result,
    session,
    title: await webContents.getTitle(),
    url: webContents.getURL()
  };
}

async function captureAxSnapshot(
  webContents: WebContents,
  session: BrowserSessionRef,
  options: { limit: number; rootAxNodeId?: string; scope: string }
): Promise<AxSnapshotResult> {
  const snapshot = await captureSnapshot(webContents, {
    maxElements: options.limit,
    maxText: options.scope === "outline" ? 0 : defaultSnapshotMaxText
  });
  const record = isRecord(snapshot) ? snapshot : {};
  const title = readString(record.title) || await webContents.getTitle();
  const url = readString(record.url) || webContents.getURL();
  const elements = Array.isArray(record.elements) ? record.elements.filter(isRecord) : [];
  const elementNodes = elements.map((element, index) => axNodeFromSnapshotElement(element, index));
  const rootNode = {
    axNodeId: "document",
    childAxNodeIds: elementNodes.map((node) => String(node.axNodeId)),
    ignored: false,
    name: title || url,
    role: "document",
    url
  };
  let nodes: Array<Record<string, unknown>> = [rootNode, ...elementNodes];
  if (options.rootAxNodeId && options.rootAxNodeId !== "document") {
    nodes = nodes.filter((node) => node.axNodeId === options.rootAxNodeId || node.ref === options.rootAxNodeId);
  }
  const result: AxSnapshotResult = {
    nodes: nodes.slice(0, options.limit),
    scope: options.scope,
    session,
    title,
    url
  };
  const handoff = await maybeRequestPageHandoff(webContents, {
    session,
    snapshot,
    tabId: session.tabId
  });
  return handoff ? { ...result, ...humanHelpResultFields(handoff) } : result;
}

async function queryAxSnapshot(
  webContents: WebContents,
  session: BrowserSessionRef,
  options: { limit: number; name?: string; role?: string; rootAxNodeId?: string; text?: string }
): Promise<Record<string, unknown>> {
  const snapshot = await captureAxSnapshot(webContents, session, {
    limit: 300,
    rootAxNodeId: options.rootAxNodeId,
    scope: "outline"
  });
  const role = options.role?.toLowerCase();
  const name = options.name?.toLowerCase();
  const text = options.text?.toLowerCase();
  const matches = snapshot.nodes
    .filter((node) => node.role !== "document")
    .filter((node) => {
      if (role && String(node.role || "").toLowerCase() !== role) {
        return false;
      }
      if (name && !String(node.name || "").toLowerCase().includes(name)) {
        return false;
      }
      if (text) {
        const haystack = [
          node.name,
          node.value,
          node.description,
          node.text,
          node.placeholder
        ].join(" ").toLowerCase();
        if (!haystack.includes(text)) {
          return false;
        }
      }
      return true;
    })
    .slice(0, options.limit);
  return {
    ...(snapshot.handoff ? humanHelpResultFields(snapshot.handoff) : {}),
    matches,
    session,
    title: snapshot.title,
    url: snapshot.url
  };
}

function axNodeFromSnapshotElement(element: Record<string, unknown>, index: number): Record<string, unknown> {
  const ref = readString(element.ref) || `element-${index}`;
  const text = readString(element.text);
  const name = readString(element.name) || text || readString(element.placeholder) || ref;
  const description = text && text !== name ? text : undefined;
  return {
    axNodeId: ref,
    backendNodeId: readNumber(element.backendNodeId),
    checked: element.checked === true ? true : undefined,
    description,
    disabled: element.disabled === true ? true : undefined,
    href: readString(element.href),
    ignored: false,
    index,
    name,
    placeholder: readString(element.placeholder),
    rect: isRecord(element.rect) ? element.rect : undefined,
    ref,
    role: readString(element.role) || readString(element.tag) || "generic",
    tag: readString(element.tag),
    text: description,
    value: readString(element.value)
  };
}

async function waitForReadiness(
  webContents: WebContents,
  waitUntil: string,
  timeoutMs: number,
  requestNavigation?: () => Promise<unknown>,
  expectedUrl?: string
): Promise<ReadinessResult> {
  if (waitUntil === "none") {
    if (requestNavigation) {
      await requestNavigation();
    }
    return { matched: true, matchedEvent: "none", readinessUrl: safeWebContentsUrl(webContents), timedOut: false };
  }
  if (webContents.isDestroyed()) {
    return { matched: false, matchedEvent: "destroyed", timedOut: false };
  }
  if (requestNavigation) {
    const readiness = waitForNextReadinessEvent(webContents, waitUntil, timeoutMs, {
      expectedUrl: normalizeNavigationUrlForMatch(expectedUrl),
      previousUrl: safeWebContentsUrl(webContents)
    });
    try {
      await requestNavigation();
    } catch (error) {
      return navigationFailureResult("navigation_request_failed", {
        errorDescription: formatError(error),
        url: normalizeNavigationUrlForMatch(expectedUrl) || safeWebContentsUrl(webContents)
      });
    }
    return await readiness;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (webContents.isDestroyed()) {
      return { matched: false, matchedEvent: "destroyed", timedOut: false };
    }

    if (!webContents.isLoading()) {
      const readinessUrl = safeWebContentsUrl(webContents);
      if (isChromiumErrorPage(readinessUrl)) {
        return navigationFailureResult("chrome-error", {
          errorDescription: "Chromium displayed an internal error page.",
          url: readinessUrl
        });
      }
      if (waitUntil === "interactive") {
        const interactive = await interactiveReadinessResult(webContents, readinessUrl);
        if (interactive) {
          return interactive;
        }
      }
      if (waitUntil === "domcontentloaded") {
        return { matched: true, matchedEvent: "domcontentloaded", readinessUrl, timedOut: false };
      }
      if (waitUntil === "load") {
        return { matched: true, matchedEvent: "load", readinessUrl, timedOut: false };
      }
      if (waitUntil === "network_idle") {
        const idle = await waitForNoLoadingStart(webContents, Math.min(500, Math.max(0, deadline - Date.now())));
        if (idle && !webContents.isDestroyed() && !webContents.isLoading()) {
          return { matched: true, matchedEvent: "network_idle", readinessUrl: safeWebContentsUrl(webContents), timedOut: false };
        }
      }
    }

    const event = await waitForReadinessEvent(webContents, Math.max(0, deadline - Date.now()));
    if (event.type === "timeout") {
      break;
    }
    if (event.type === "destroyed") {
      return { matched: false, matchedEvent: "destroyed", timedOut: false };
    }
    if (event.type === "did-fail-load" && event.errorCode !== -3) {
      return navigationFailureResult("did-fail-load", event);
    }
    const eventUrl = event.url || safeWebContentsUrl(webContents);
    if (isChromiumErrorPage(eventUrl)) {
      return navigationFailureResult("chrome-error", {
        errorDescription: "Chromium displayed an internal error page.",
        url: eventUrl
      });
    }
    if (waitUntil === "interactive" && isInteractiveReadinessEvent(event)) {
      const interactive = await interactiveReadinessResult(webContents, eventUrl);
      if (interactive) {
        return interactive;
      }
    }
    if (waitUntil === "domcontentloaded" && event.type === "dom-ready") {
      return { matched: true, matchedEvent: "domcontentloaded", readinessUrl: eventUrl, timedOut: false };
    }
    if (waitUntil === "load" && (event.type === "did-finish-load" || event.type === "did-stop-loading") && !webContents.isDestroyed() && !webContents.isLoading()) {
      return { matched: true, matchedEvent: "load", readinessUrl: eventUrl, timedOut: false };
    }
    if (waitUntil === "network_idle" && (event.type === "did-finish-load" || event.type === "did-stop-loading") && !webContents.isDestroyed() && !webContents.isLoading()) {
      const idle = await waitForNoLoadingStart(webContents, Math.min(500, Math.max(0, deadline - Date.now())));
      if (idle && !webContents.isDestroyed() && !webContents.isLoading()) {
        return { matched: true, matchedEvent: "network_idle", readinessUrl: safeWebContentsUrl(webContents), timedOut: false };
      }
    }
  }
  if (waitUntil === "interactive" || waitUntil === "network_idle") {
    const fallback = await interactiveReadinessResult(
      webContents,
      undefined,
      waitUntil === "network_idle" ? "interactive_after_network_idle_timeout" : "interactive"
    );
    if (fallback) {
      return fallback;
    }
  }
  return {
    matched: false,
    matchedEvent: webContents.isDestroyed() ? "destroyed" : undefined,
    timedOut: !webContents.isDestroyed()
  };
}

async function waitForNextReadinessEvent(
  webContents: WebContents,
  waitUntil: string,
  timeoutMs: number,
  context: NavigationReadinessContext
): Promise<ReadinessResult> {
  const deadline = Date.now() + timeoutMs;
  let navigationStarted = false;
  let lastNavigationUrl: string | undefined;

  while (Date.now() <= deadline) {
    if (webContents.isDestroyed()) {
      return { matched: false, matchedEvent: "destroyed", timedOut: false };
    }

    const event = await waitForReadinessEvent(webContents, Math.max(0, deadline - Date.now()));
    if (event.type === "timeout") {
      break;
    }
    if (event.type === "destroyed") {
      return { matched: false, matchedEvent: "destroyed", timedOut: false };
    }

    const eventUrl = event.url || safeWebContentsUrl(webContents);
    if (isNavigationStartEvent(event)) {
      if (event.isMainFrame !== false && isRelevantNavigationUrl(eventUrl, context)) {
        navigationStarted = true;
        lastNavigationUrl = eventUrl;
      }
      continue;
    }

    if (event.type === "did-fail-load") {
      if (event.errorCode === -3) {
        continue;
      }
      if (event.isMainFrame !== false && (navigationStarted || isRelevantNavigationUrl(eventUrl, context))) {
        return navigationFailureResult("did-fail-load", event);
      }
      continue;
    }

    if (!navigationStarted) {
      continue;
    }

    if (isChromiumErrorPage(eventUrl)) {
      return navigationFailureResult("chrome-error", {
        errorDescription: "Chromium displayed an internal error page.",
        url: eventUrl
      });
    }
    if (waitUntil === "interactive" && isInteractiveReadinessEvent(event)) {
      const interactive = await interactiveReadinessResult(webContents, eventUrl || lastNavigationUrl);
      if (interactive) {
        return interactive;
      }
    }
    if (waitUntil === "domcontentloaded" && event.type === "dom-ready") {
      return { matched: true, matchedEvent: "domcontentloaded", readinessUrl: eventUrl || lastNavigationUrl, timedOut: false };
    }
    if (waitUntil === "load" && (event.type === "did-finish-load" || event.type === "did-stop-loading") && !webContents.isDestroyed() && !webContents.isLoading()) {
      return { matched: true, matchedEvent: "load", readinessUrl: eventUrl || lastNavigationUrl, timedOut: false };
    }
    if (waitUntil === "network_idle" && (event.type === "did-finish-load" || event.type === "did-stop-loading") && !webContents.isDestroyed() && !webContents.isLoading()) {
      const idle = await waitForNoLoadingStart(webContents, Math.min(500, Math.max(0, deadline - Date.now())));
      if (idle && !webContents.isDestroyed() && !webContents.isLoading()) {
        return { matched: true, matchedEvent: "network_idle", readinessUrl: safeWebContentsUrl(webContents) || lastNavigationUrl, timedOut: false };
      }
    }
  }
  if (waitUntil === "interactive" || waitUntil === "network_idle") {
    const fallback = await interactiveReadinessResult(
      webContents,
      lastNavigationUrl,
      waitUntil === "network_idle" ? "interactive_after_network_idle_timeout" : "interactive"
    );
    if (fallback && (navigationStarted || isRelevantNavigationUrl(fallback.readinessUrl, context))) {
      return fallback;
    }
  }
  return {
    matched: false,
    matchedEvent: webContents.isDestroyed() ? "destroyed" : undefined,
    timedOut: !webContents.isDestroyed()
  };
}

function waitForReadinessEvent(webContents: WebContents, timeoutMs: number): Promise<ReadinessEvent> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (event: ReadinessEvent) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      webContents.off("did-navigate", onDidNavigate);
      webContents.off("did-redirect-navigation", onDidRedirectNavigation);
      webContents.off("did-fail-load", onDidFailLoad);
      webContents.off("did-finish-load", onDidFinishLoad);
      webContents.off("did-start-navigation", onDidStartNavigation);
      webContents.off("did-start-loading", onDidStartLoading);
      webContents.off("did-stop-loading", onDidStopLoading);
      webContents.off("dom-ready", onDomReady);
      webContents.off("destroyed", onDestroyed);
      resolve(event);
    };
    const onDidFailLoad = (
      _event: ElectronEvent,
      errorCode: number,
      errorDescription: string,
      validatedUrl: string,
      isMainFrame?: boolean
    ) => finish({
      errorCode,
      errorDescription,
      isMainFrame,
      type: "did-fail-load",
      url: validatedUrl || safeWebContentsUrl(webContents)
    });
    const onDidFinishLoad = () => finish({ type: "did-finish-load", url: safeWebContentsUrl(webContents) });
    const onDidNavigate = (_event: ElectronEvent, url: string) => finish({ isMainFrame: true, type: "did-navigate", url });
    const onDidRedirectNavigation = (_event: ElectronEvent, url: string, isInPlace?: boolean, isMainFrame?: boolean) => {
      finish({ isMainFrame, type: isInPlace ? "did-navigate-in-page" : "did-redirect-navigation", url });
    };
    const onDidStartNavigation = (_event: ElectronEvent, url: string, isInPlace?: boolean, isMainFrame?: boolean) => {
      finish({ isMainFrame, type: isInPlace ? "did-navigate-in-page" : "did-start-navigation", url });
    };
    const onDidStartLoading = () => finish({ type: "did-start-loading", url: safeWebContentsUrl(webContents) });
    const onDidStopLoading = () => finish({ type: "did-stop-loading", url: safeWebContentsUrl(webContents) });
    const onDomReady = () => finish({ type: "dom-ready", url: safeWebContentsUrl(webContents) });
    const onDestroyed = () => finish({ type: "destroyed" });
    const timer = setTimeout(() => finish({ type: "timeout" }), Math.max(0, timeoutMs));

    webContents.once("did-navigate", onDidNavigate);
    webContents.once("did-redirect-navigation", onDidRedirectNavigation);
    webContents.once("did-fail-load", onDidFailLoad);
    webContents.once("did-finish-load", onDidFinishLoad);
    webContents.once("did-start-navigation", onDidStartNavigation);
    webContents.once("did-start-loading", onDidStartLoading);
    webContents.once("did-stop-loading", onDidStopLoading);
    webContents.once("dom-ready", onDomReady);
    webContents.once("destroyed", onDestroyed);
  });
}

function waitForNoLoadingStart(webContents: WebContents, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (idle: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      webContents.off("did-start-loading", onDidStartLoading);
      webContents.off("destroyed", onDestroyed);
      resolve(idle);
    };
    const onDidStartLoading = () => finish(false);
    const onDestroyed = () => finish(false);
    const timer = setTimeout(() => finish(true), Math.max(0, timeoutMs));
    webContents.once("did-start-loading", onDidStartLoading);
    webContents.once("destroyed", onDestroyed);
  });
}

async function interactiveReadinessResult(
  webContents: WebContents,
  fallbackUrl?: string,
  matchedEvent = "interactive"
): Promise<ReadinessResult | undefined> {
  if (webContents.isDestroyed()) {
    return undefined;
  }
  const readinessUrl = safeWebContentsUrl(webContents) || fallbackUrl;
  if (!isUsableInteractiveUrl(readinessUrl)) {
    return undefined;
  }
  const readyState = await documentReadyState(webContents);
  if (readyState === "interactive" || readyState === "complete" || !webContents.isLoading()) {
    return { matched: true, matchedEvent, readinessUrl, timedOut: false };
  }
  return undefined;
}

async function documentReadyState(webContents: WebContents): Promise<string | undefined> {
  try {
    const value = await executeJavaScriptWithTimeout<string>(
      webContents,
      "document.readyState",
      1000,
      "Document readiness check"
    );
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function isInteractiveReadinessEvent(event: ReadinessEvent): boolean {
  return event.type === "dom-ready" ||
    event.type === "did-finish-load" ||
    event.type === "did-stop-loading";
}

function isUsableInteractiveUrl(value: string | undefined): value is string {
  return Boolean(value) && !isBlankPageUrl(value) && !isChromiumErrorPage(value);
}

function navigationFailureResult(matchedEvent: string, event: Pick<ReadinessEvent, "errorCode" | "errorDescription" | "url">): ReadinessResult {
  return {
    matched: false,
    matchedEvent,
    navigationError: {
      ...(event.errorCode !== undefined ? { errorCode: event.errorCode } : {}),
      ...(event.errorDescription ? { errorDescription: event.errorDescription } : {}),
      ...(event.url ? { url: event.url } : {})
    },
    readinessUrl: event.url,
    timedOut: false
  };
}

function isNavigationStartEvent(event: ReadinessEvent): boolean {
  return event.type === "did-start-navigation" ||
    event.type === "did-redirect-navigation" ||
    event.type === "did-navigate";
}

function isRelevantNavigationUrl(url: string | undefined, context: NavigationReadinessContext): boolean {
  if (!url) {
    return false;
  }
  const normalizedUrl = normalizeUrlForComparison(url);
  if (!normalizedUrl) {
    return false;
  }
  if (context.expectedUrl && urlsMatchForNavigation(normalizedUrl, context.expectedUrl)) {
    return true;
  }
  if (isChromiumErrorPage(normalizedUrl)) {
    return true;
  }
  if (isBlankPageUrl(normalizedUrl)) {
    return isBlankPageUrl(context.expectedUrl);
  }
  if (!context.previousUrl) {
    return true;
  }
  return !urlsMatchForNavigation(normalizedUrl, context.previousUrl);
}

function normalizeNavigationUrlForMatch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (isBlankPageUrl(trimmed) || isChromiumErrorPage(trimmed)) {
    return trimmed;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return normalizeUrlForComparison(trimmed);
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) || trimmed.includes(".")) {
    return normalizeUrlForComparison(`https://${trimmed}`);
  }
  return normalizeUrlForComparison(`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`);
}

function normalizeUrlForComparison(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function urlsMatchForNavigation(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  const normalizedLeft = normalizeUrlForComparison(left);
  const normalizedRight = normalizeUrlForComparison(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  try {
    const leftUrl = new URL(normalizedLeft);
    const rightUrl = new URL(normalizedRight);
    return leftUrl.protocol === rightUrl.protocol &&
      leftUrl.hostname === rightUrl.hostname &&
      leftUrl.pathname === rightUrl.pathname &&
      leftUrl.search === rightUrl.search;
  } catch {
    return normalizedLeft === normalizedRight;
  }
}

function isBlankPageUrl(value: string | undefined): boolean {
  return value === "about:blank";
}

function isChromiumErrorPage(value: string | undefined): boolean {
  return value === "chrome-error://chromewebdata/";
}

function safeWebContentsUrl(webContents: WebContents): string | undefined {
  if (webContents.isDestroyed()) {
    return undefined;
  }
  try {
    return webContents.getURL();
  } catch {
    return undefined;
  }
}

function normalizeWaitUntil(value: string | undefined, fallback: string): string {
  const normalized = (value || fallback).toLowerCase().replace(/[-\s]/g, "_");
  if (normalized === "auto" || normalized === "interactive" || normalized === "ready") {
    return "interactive";
  }
  if (normalized === "dom_ready" || normalized === "domcontentloaded") {
    return "domcontentloaded";
  }
  if (normalized === "networkidle" || normalized === "network_idle") {
    return "network_idle";
  }
  if (normalized === "none" || normalized === "load") {
    return normalized;
  }
  return fallback;
}

function readHandoffKind(value: unknown): BuiltInBrowserAutomationHandoffKind {
  const kind = readString(value);
  if (
    kind === "blocked" ||
    kind === "human_verification" ||
    kind === "login_required" ||
    kind === "other" ||
    kind === "verification_code"
  ) {
    return kind;
  }
  return "other";
}

function normalizeEventChannels(values: string[]): Set<string> {
  const normalized = values
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return new Set(["tab", "navigation", "dom", "runtime", "dialog", "download", "input", "focus", "selection", "handoff"]);
  }
  return new Set(normalized);
}

function matchesSubscriptionEvent(subscription: EventSubscription, event: BrowserAutomationEvent): boolean {
  const channel = eventChannel(event.kind);
  if (!subscription.channels.has(channel) && !subscription.channels.has(event.kind) && !subscription.channels.has("*")) {
    return false;
  }
  if (!subscription.ref) {
    return true;
  }
  if (!event.tabId || event.tabId === subscription.ref.tabId) {
    return true;
  }
  return channel === "tab";
}

function eventChannel(kind: string): string {
  if (kind.startsWith("tab.")) return "tab";
  if (kind.startsWith("page.navigation") || kind.startsWith("page.loading")) return "navigation";
  if (kind === "page.dom_ready") return "dom";
  if (kind.startsWith("runtime.")) return "runtime";
  if (kind.startsWith("dialog.")) return "dialog";
  if (kind.startsWith("download.")) return "download";
  if (kind.startsWith("handoff.")) return "handoff";
  if (kind.startsWith("input.")) return "input";
  if (kind.startsWith("focus.")) return "focus";
  if (kind.startsWith("selection.")) return "selection";
  return kind.split(".")[0] || kind;
}

function subscriptionDescriptor(subscription: EventSubscription): Record<string, unknown> {
  return {
    channels: [...subscription.channels],
    cursor: makeEventCursor(subscription),
    redactTextInput: subscription.redactTextInput,
    sampleMouseMove: subscription.sampleMouseMove,
    session: subscription.ref,
    startedAt: subscription.startedAt,
    subscriptionId: subscription.subscriptionId
  };
}

function findRecentHandoffResolution(filter: { handoffId?: string; tabId?: string }): BrowserAutomationEvent | undefined {
  const events = builtInBrowserService.getAutomationEvents({ replayRecentMs: automationEventReplayMs });
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "handoff.completed" && event.kind !== "handoff.dismissed") {
      continue;
    }
    if (filter.handoffId && event.handoffId !== filter.handoffId) {
      continue;
    }
    if (filter.tabId && event.tabId !== filter.tabId) {
      continue;
    }
    return event;
  }
  return undefined;
}

function handoffResolutionResult(
  event: BrowserAutomationEvent,
  handoff: BuiltInBrowserAutomationHandoff | undefined,
  timedOut: boolean
): Record<string, unknown> {
  return {
    event,
    handoff,
    matched: !timedOut,
    state: browserWindowState(),
    status: event.handoffStatus || (event.kind === "handoff.completed" ? "completed" : "dismissed"),
    timedOut,
    title: event.title,
    url: event.url
  };
}

function eventsAfterCursor(subscription: EventSubscription, cursorSeq?: number): BrowserAutomationEvent[] {
  const seq = cursorSeq ?? 0;
  return subscription.events.filter((event) => event.seq > seq);
}

function cursorDropped(subscription: EventSubscription, cursorSeq?: number): boolean {
  if (cursorSeq === undefined || subscription.events.length === 0) {
    return subscription.dropped;
  }
  return subscription.dropped && cursorSeq < subscription.events[0].seq - 1;
}

function makeEventCursor(subscription: EventSubscription, seq?: number): Record<string, unknown> {
  const lastEvent = subscription.events.findLast((event) => seq === undefined || event.seq <= seq) || subscription.events.at(-1);
  return {
    dropped: subscription.dropped,
    seq: seq ?? lastEvent?.seq ?? 0,
    subscriptionId: subscription.subscriptionId,
    ts: lastEvent?.ts ?? subscription.startedAt
  };
}

function readCursorSeq(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readNumber(value.seq);
}

function matchesAwaitFilter(event: BrowserAutomationEvent, args: Record<string, unknown>): boolean {
  const match = isRecord(args.match) ? args.match : args;
  const kinds = readStringArray(match.kinds);
  const kind = readString(match.kind);
  if (kind && event.kind !== kind) {
    return false;
  }
  if (kinds.length > 0 && !kinds.includes(event.kind)) {
    return false;
  }
  const tabId = readString(match.tabId);
  if (tabId && event.tabId !== tabId) {
    return false;
  }
  const windowId = readString(match.windowId);
  if (windowId && event.windowId !== windowId) {
    return false;
  }
  return stringMatchesPattern(event.url, readString(match.urlPattern))
    && stringMatchesPattern(event.title, readString(match.titlePattern))
    && stringMatchesPattern(event.summary, readString(match.summaryPattern));
}

function stringMatchesPattern(value: string | undefined, pattern: string | undefined): boolean {
  if (!pattern) {
    return true;
  }
  const haystack = value || "";
  try {
    return new RegExp(pattern).test(haystack);
  } catch {
    return haystack.toLowerCase().includes(pattern.toLowerCase());
  }
}

async function handleJavaScriptDialog(
  webContents: WebContents,
  accept: boolean,
  promptText: string | undefined,
  session: BrowserSessionRef
): Promise<Record<string, unknown>> {
  let attachedHere = false;
  try {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach("1.3");
      attachedHere = true;
    }
    await withTimeout(webContents.debugger.sendCommand("Page.enable"), defaultJavascriptTimeoutMs, "Timed out enabling browser dialog handling.");
    await withTimeout(
      webContents.debugger.sendCommand("Page.handleJavaScriptDialog", {
        accept,
        ...(promptText !== undefined ? { promptText } : {})
      }),
      defaultJavascriptTimeoutMs,
      "Timed out handling browser dialog."
    );
    return {
      accepted: accept,
      ok: true,
      promptText,
      session,
      title: await webContents.getTitle(),
      url: webContents.getURL()
    };
  } catch (error) {
    throw new Error(`Failed to handle browser dialog: ${formatError(error)}`);
  } finally {
    if (attachedHere && webContents.debugger.isAttached()) {
      try {
        webContents.debugger.detach();
      } catch {
        // Ignore detach errors after the dialog is resolved.
      }
    }
  }
}

async function executeJavaScriptWithTimeout<T = unknown>(
  webContents: WebContents,
  script: string,
  timeoutMs: number,
  label: string
): Promise<T> {
  if (webContents.isDestroyed()) {
    throw new Error(`${label} failed because the browser tab is destroyed.`);
  }
  return await withTimeout(
    webContents.executeJavaScript(script, true) as Promise<T>,
    timeoutMs,
    `${label} timed out after ${timeoutMs}ms.`
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), Math.max(0, timeoutMs));
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function captureSnapshot(webContents: WebContents, options: SnapshotOptions): Promise<unknown> {
  return await executeJavaScriptWithTimeout(
    webContents,
    `(${snapshotScript})(${JSON.stringify(options)})`,
    defaultJavascriptTimeoutMs,
    "Browser snapshot"
  ) as unknown;
}

async function captureSnapshotWithHandoff(
  webContents: WebContents,
  tabId: string | undefined,
  options: SnapshotOptions
): Promise<unknown> {
  const snapshot = await captureSnapshot(webContents, options);
  const handoff = await maybeRequestPageHandoff(webContents, {
    snapshot,
    tabId
  });
  if (!handoff || !isRecord(snapshot)) {
    return snapshot;
  }
  return {
    ...snapshot,
    ...humanHelpResultFields(handoff)
  };
}

async function maybeRequestHandoffAfterNavigation(
  webContents: WebContents,
  readiness: ReadinessResult,
  options: {
    requestedUrl?: string;
    session?: BrowserSessionRef;
    tabId?: string;
    waitUntil?: string;
  }
): Promise<BuiltInBrowserAutomationHandoff | undefined> {
  if (webContents.isDestroyed()) {
    return undefined;
  }

  if (!readiness.navigationError) {
    const pageHandoff = await maybeRequestPageHandoff(webContents, {
      session: options.session,
      tabId: options.tabId
    });
    if (pageHandoff) {
      return pageHandoff;
    }
  }

  return maybeRequestNavigationHandoff(webContents, readiness, options);
}

function maybeRequestNavigationHandoff(
  webContents: WebContents,
  readiness: ReadinessResult,
  options: {
    requestedUrl?: string;
    session?: BrowserSessionRef;
    tabId?: string;
    waitUntil?: string;
  }
): BuiltInBrowserAutomationHandoff | undefined {
  if (readiness.matched || webContents.isDestroyed()) {
    return undefined;
  }

  const tabId = options.tabId || options.session?.tabId;
  const existing = existingHandoffForTab(tabId);
  if (existing) {
    return existing;
  }

  const currentUrl = safeWebContentsUrl(webContents);
  const target = options.requestedUrl || readiness.readinessUrl || currentUrl || "the requested page";
  const error = readiness.navigationError;
  const reason = error
    ? `Browser navigation was blocked or failed while opening ${target}${error.errorCode !== undefined ? ` (error ${error.errorCode})` : ""}${error.errorDescription ? `: ${error.errorDescription}` : "."}`
    : `Browser automation did not reach ${options.waitUntil || "the requested readiness state"} while opening ${target}.`;

  return builtInBrowserService.requestAutomationHandoff({
    kind: "blocked",
    message: "Please inspect this browser page and complete or retry the blocked step, then click Done.",
    reason,
    sessionId: options.session?.sessionId,
    tabId
  });
}

async function maybeRequestPageHandoff(
  webContents: WebContents,
  options: {
    session?: BrowserSessionRef;
    snapshot?: unknown;
    tabId?: string;
  } = {}
): Promise<BuiltInBrowserAutomationHandoff | undefined> {
  if (webContents.isDestroyed()) {
    return undefined;
  }

  let snapshot = options.snapshot;
  if (snapshot === undefined) {
    try {
      snapshot = await captureSnapshot(webContents, {
        maxElements: 20,
        maxText: 1200
      });
    } catch {
      snapshot = undefined;
    }
  }

  const detection = detectPageHandoff(snapshot, {
    title: await webContents.getTitle(),
    url: webContents.getURL()
  });
  if (!detection) {
    return undefined;
  }

  const tabId = options.tabId || options.session?.tabId;
  const existing = existingHandoffForTab(tabId);
  if (existing) {
    return existing;
  }

  return builtInBrowserService.requestAutomationHandoff({
    kind: detection.kind,
    message: detection.message,
    reason: detection.reason,
    sessionId: options.session?.sessionId,
    tabId
  });
}

function existingHandoffForTab(tabId: string | undefined): BuiltInBrowserAutomationHandoff | undefined {
  const existing = builtInBrowserService.getAutomationState().automationHandoff;
  if (existing && (!tabId || existing.tabId === tabId)) {
    return existing;
  }
  return undefined;
}

function handoffMatches(
  handoff: BuiltInBrowserAutomationHandoff | undefined,
  filter: { handoffId?: string; tabId?: string }
): boolean {
  if (!handoff) {
    return false;
  }
  if (filter.handoffId && handoff.id !== filter.handoffId) {
    return false;
  }
  if (filter.tabId && handoff.tabId !== filter.tabId) {
    return false;
  }
  return true;
}

function detectPageHandoff(snapshot: unknown, fallback: { title?: string; url?: string }): BrowserHandoffDetection | undefined {
  const record = isRecord(snapshot) ? snapshot : {};
  const title = readString(record.title) || fallback.title || "";
  const url = readString(record.url) || fallback.url || "";
  const signal = pageHandoffSignal(record, title, url);
  if (isChromiumErrorPage(url)) {
    return {
      kind: "blocked",
      message: "Please inspect this browser error page and retry or complete the blocked step, then click Done.",
      reason: "Chromium displayed an internal error page for this navigation."
    };
  }
  if (!signal) {
    return undefined;
  }

  const verificationCode = /verification code|security code|one[-\s]?time code|2[-\s]?step|two[-\s]?step|authenticator|check your (?:phone|email)|enter the code/.test(signal);
  if (verificationCode) {
    return {
      kind: "verification_code",
      message: "Please enter the verification code in this browser window, then click Done.",
      reason: `The page appears to require a verification code: ${title || url || "current page"}.`
    };
  }

  const cloudflare = signal.includes("cloudflare") || /\bray id\s*:/.test(signal);
  const botVerification = /performing security verification|security verification|verif(?:y|ies|ying)[^.\n]{0,80}(?:not a bot|human)|not a bot|not a robot|human verification|are you human|checking your browser|security check/.test(signal);
  const challenge = /captcha|hcaptcha|recaptcha|turnstile|cf-challenge|cf-turnstile/.test(signal);
  const justAMoment = title.trim().toLowerCase() === "just a moment..." || signal.includes("just a moment...");
  if (challenge || (cloudflare && (botVerification || justAMoment))) {
    return {
      kind: "human_verification",
      message: "Please complete the security verification in this browser window, then click Done.",
      reason: `The page appears to be a human verification or bot-protection challenge: ${title || url || "current page"}.`
    };
  }

  const loginUrl = /(?:^|[/.?=&_-])(?:login|signin|sign-in|accounts)(?:[/.?=&_-]|$)/.test(url.toLowerCase()) ||
    /accounts\.google\.com|mail\.google\.com/.test(url.toLowerCase());
  const loginTitle = /\bsign in\b|\blog in\b|\blogin\b|google accounts|account login/.test(title.toLowerCase());
  const credentialFields = /email or phone|email address|username|password|forgot (?:email|password)|create account|\bnext\b/.test(signal);
  if ((loginUrl || loginTitle) && credentialFields) {
    return {
      kind: "login_required",
      message: "Please sign in in this browser window, then click Done.",
      reason: `The page appears to require a human login: ${title || url || "current page"}.`
    };
  }

  return undefined;
}

function humanHelpResultFields(handoff: BuiltInBrowserAutomationHandoff): Record<string, unknown> {
  return {
    handoff,
    handoffRequired: true,
    humanHelp: {
      aliasTool: "askHumanHelp",
      instruction: "Browser automation needs human help. The browser window has been shown with a top toolbar instruction. Call browser_handoff_wait to receive the user's Done/Hide result before continuing automation.",
      handoffId: handoff.id,
      message: handoff.message,
      reason: handoff.reason,
      required: true,
      status: "requested",
      tool: "browser_handoff_wait"
    },
    humanHelpRequired: true,
    nextAction: "human_help"
  };
}

function pageHandoffSignal(record: Record<string, unknown>, title: string, url: string): string {
  const parts = [title, url, rawString(record.text)];
  const activeElement = isRecord(record.activeElement) ? record.activeElement : undefined;
  if (activeElement) {
    parts.push(rawString(activeElement.name), rawString(activeElement.text), rawString(activeElement.role));
  }
  const elements = Array.isArray(record.elements) ? record.elements : [];
  for (const element of elements.slice(0, 40)) {
    if (!isRecord(element)) {
      continue;
    }
    parts.push(
      rawString(element.name),
      rawString(element.text),
      rawString(element.role),
      rawString(element.tag),
      rawString(element.href)
    );
  }
  return parts
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function runTargetAction(
  webContents: WebContents,
  action: "click" | "focus" | "scroll" | "select" | "type",
  target?: BrowserTarget,
  value: Record<string, unknown> = {}
): Promise<unknown> {
  const result = await executeJavaScriptWithTimeout(
    webContents,
    `(${targetActionScript})(${JSON.stringify({ action, target, value })})`,
    defaultJavascriptTimeoutMs,
    `Browser target action ${action}`
  ) as { error?: string; ok?: boolean };
  if (!result?.ok) {
    throw new Error(result?.error || `Browser target action failed: ${action}`);
  }
  return result;
}

async function pressKey(webContents: WebContents, key: string, target?: BrowserTarget): Promise<unknown> {
  if (target) {
    await runTargetAction(webContents, "focus", target);
  }
  webContents.sendInputEvent({ keyCode: key, type: "keyDown" });
  webContents.sendInputEvent({ keyCode: key, type: "keyUp" });
  return {
    key,
    ok: true,
    title: await webContents.getTitle(),
    url: webContents.getURL()
  };
}

async function waitForPageCondition(
  webContents: WebContents,
  condition: {
    selector?: string;
    text?: string;
    timeoutMs: number;
    urlIncludes?: string;
    urlMatches?: string;
  }
): Promise<unknown> {
  const deadline = Date.now() + condition.timeoutMs;
  let last: unknown;
  while (Date.now() <= deadline) {
    try {
      last = await executeJavaScriptWithTimeout(
        webContents,
        `(${waitForConditionScript})(${JSON.stringify(condition)})`,
        Math.max(100, Math.min(1000, deadline - Date.now())),
        "Browser wait condition check"
      ) as unknown;
      if (isRecord(last) && last.matched === true) {
        return last;
      }
    } catch (error) {
      last = {
        error: formatError(error),
        matched: false
      };
    }
    await sleep(150);
  }
  return {
    last,
    matched: false,
    timedOut: true,
    title: await webContents.getTitle(),
    url: webContents.getURL()
  };
}

const snapshotScript = function(options: { limit?: number; maxElements: number; maxText?: number; offset?: number }) {
  const maxElements = Math.max(1, Math.min(300, Math.floor(options.maxElements || 80)));
  const textLimitInput = options.limit ?? options.maxText ?? 3000;
  const textLimit = Math.max(0, Math.min(20000, Math.floor(textLimitInput)));
  const requestedTextOffset = Math.max(0, Math.floor(options.offset || 0));
  const refAttribute = "data-ccr-browser-ref";
  const elementSelector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "summary",
    "[role]",
    "[contenteditable='true']",
    "[contenteditable='plaintext-only']",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  function visible(el: Element) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function cssEscape(value: string) {
    return window.CSS && typeof window.CSS.escape === "function"
      ? window.CSS.escape(value)
      : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function uniqueIdSelector(id: string) {
    if (!id) return "";
    const selector = `#${cssEscape(id)}`;
    try {
      return document.querySelectorAll(selector).length === 1 ? selector : "";
    } catch {
      return "";
    }
  }

  function refFor(el: Element) {
    const win = window as Window & { __ccrBrowserRefSeq?: number };
    const existing = el.getAttribute(refAttribute);
    if (existing) {
      return `[${refAttribute}="${cssEscape(existing)}"]`;
    }
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      win.__ccrBrowserRefSeq = (win.__ccrBrowserRefSeq || 0) + 1;
      const nextRef = `ccr-${win.__ccrBrowserRefSeq}`;
      const selector = `[${refAttribute}="${cssEscape(nextRef)}"]`;
      if (!document.querySelector(selector)) {
        el.setAttribute(refAttribute, nextRef);
        return selector;
      }
    }

    const idSelector = uniqueIdSelector((el as HTMLElement).id || "");
    if (idSelector) return idSelector;
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current.nodeType === 1 && current !== document.documentElement && parts.length < 8) {
      const tag = current.tagName.toLowerCase();
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const parentIdSelector = uniqueIdSelector(parent.id || "");
      const sameTag = Array.from(parent.children).filter((child): child is Element => child instanceof Element && child.tagName === current!.tagName);
      const index = sameTag.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${Math.max(index, 1)})`);
      if (parentIdSelector) {
        parts.unshift(parentIdSelector);
        break;
      }
      current = parent;
    }
    return parts.join(" > ");
  }

  function text(el: Element) {
    return ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function labelText(el: Element) {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const value = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (value) return value;
    }
    const id = (el as HTMLInputElement).id;
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label) return text(label);
    }
    const wrappingLabel = el.closest("label");
    return wrappingLabel ? text(wrappingLabel) : "";
  }

  function unsafeField(el: Element) {
    const input = el as HTMLInputElement;
    const haystack = [
      input.type,
      input.name,
      input.id,
      input.autocomplete,
      el.getAttribute("aria-label"),
      labelText(el)
    ].join(" ").toLowerCase();
    return /\b(password|secret|token|api[-_ ]?key|bearer|credential)\b/.test(haystack);
  }

  function valueOf(el: Element) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return "";
    }
    if (unsafeField(el)) {
      return "<redacted>";
    }
    return el.value || "";
  }

  function roleOf(el: Element) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "summary") return "button";
    if (tag === "input") {
      if (["button", "submit", "reset"].includes(input.type)) return "button";
      if (input.type === "checkbox") return "checkbox";
      if (input.type === "radio") return "radio";
      if (input.type === "range") return "slider";
      return "textbox";
    }
    if (el.getAttribute("contenteditable")) return "textbox";
    return "";
  }

  function nameOf(el: Element) {
    const input = el as HTMLInputElement;
    return (
      el.getAttribute("aria-label") ||
      labelText(el) ||
      el.getAttribute("alt") ||
      el.getAttribute("title") ||
      input.placeholder ||
      (input.type && ["button", "submit", "reset"].includes(input.type) ? input.value : "") ||
      text(el)
    ).replace(/\s+/g, " ").trim();
  }

  const elements = Array.from(document.querySelectorAll(elementSelector))
    .filter(visible)
    .slice(0, maxElements)
    .map((el, index) => {
      const rect = el.getBoundingClientRect();
      return {
        checked: el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type) ? el.checked : undefined,
        disabled: (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled || undefined,
        href: el instanceof HTMLAnchorElement ? el.href : undefined,
        index,
        name: nameOf(el).slice(0, 240),
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        rect: {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.x),
          y: Math.round(rect.y)
        },
        ref: refFor(el),
        role: roleOf(el),
        tag: el.tagName.toLowerCase(),
        text: text(el).slice(0, 180),
        value: valueOf(el) || undefined
      };
    });

  const pageText = (document.body?.innerText || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const textOffset = Math.min(requestedTextOffset, pageText.length);
  const textWindow = pageText.slice(textOffset, textOffset + textLimit);
  const textNextOffset = textOffset + textWindow.length;

  return {
    activeElement: document.activeElement ? {
      name: nameOf(document.activeElement).slice(0, 240),
      ref: refFor(document.activeElement),
      role: roleOf(document.activeElement),
      tag: document.activeElement.tagName.toLowerCase()
    } : undefined,
    elements,
    text: textWindow,
    textHasMore: textNextOffset < pageText.length,
    textLength: pageText.length,
    textLimit,
    textNextOffset,
    textOffset,
    textRemaining: Math.max(0, pageText.length - textNextOffset),
    textReturned: textWindow.length,
    textRequestedOffset: requestedTextOffset !== textOffset ? requestedTextOffset : undefined,
    title: document.title,
    url: location.href
  };
};

const targetActionScript = function(request: {
  action: "click" | "focus" | "scroll" | "select" | "type";
  target?: BrowserTarget;
  value?: Record<string, unknown>;
}) {
  function visible(el: Element) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }
  function text(el: Element) {
    return ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function cssEscape(value: string) {
    return window.CSS && typeof window.CSS.escape === "function"
      ? window.CSS.escape(value)
      : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function labelText(el: Element) {
    const id = (el as HTMLInputElement).id;
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label) return text(label);
    }
    const wrappingLabel = el.closest("label");
    return wrappingLabel ? text(wrappingLabel) : "";
  }
  function roleOf(el: Element) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.toLowerCase();
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "summary") return "button";
    if (tag === "input") {
      if (["button", "submit", "reset"].includes(input.type)) return "button";
      if (input.type === "checkbox") return "checkbox";
      if (input.type === "radio") return "radio";
      return "textbox";
    }
    if (el.getAttribute("contenteditable")) return "textbox";
    return "";
  }
  function nameOf(el: Element) {
    const input = el as HTMLInputElement;
    return (
      el.getAttribute("aria-label") ||
      labelText(el) ||
      el.getAttribute("alt") ||
      el.getAttribute("title") ||
      input.placeholder ||
      input.value ||
      text(el)
    ).replace(/\s+/g, " ").trim();
  }
  function summarize(el: Element) {
    const rect = el.getBoundingClientRect();
    return {
      name: nameOf(el).slice(0, 240),
      rect: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.x),
        y: Math.round(rect.y)
      },
      role: roleOf(el),
      tag: el.tagName.toLowerCase(),
      text: text(el).slice(0, 180)
    };
  }
  function selectorElement(selector: string) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }
  function matchesText(value: string, needle: string, exact?: boolean) {
    const left = value.trim().toLowerCase();
    const right = needle.trim().toLowerCase();
    return exact ? left === right : left.includes(right);
  }
  function findTarget(target?: BrowserTarget) {
    if (!target && request.action !== "scroll") return null;
    const directSelector = target?.selector || target?.ref || target?.axNodeId;
    if (directSelector) {
      return selectorElement(directSelector);
    }
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      "[role]",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const candidates = Array.from(document.querySelectorAll(selector)).filter(visible);
    const role = target?.role?.trim().toLowerCase();
    const needle = target?.text?.trim();
    const matches = candidates.filter((el) => {
      if (role && roleOf(el) !== role) return false;
      if (!needle) return true;
      const haystack = [
        nameOf(el),
        text(el),
        (el as HTMLInputElement).placeholder || "",
        (el as HTMLInputElement).value || ""
      ].join(" ");
      return matchesText(haystack, needle, target?.exact);
    });
    return matches[Math.max(0, Math.floor(target?.index || 0))] || null;
  }
  function dispatchValueEvents(el: Element) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const el = findTarget(request.target);
  if (!el && request.action !== "scroll") {
    return { error: "No matching browser element found.", ok: false };
  }
  if (el) {
    el.scrollIntoView({ block: "center", inline: "center" });
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true });
    }
  }

  if (request.action === "focus") {
    return { element: el ? summarize(el) : undefined, ok: true };
  }

  if (request.action === "click") {
    if (!(el instanceof HTMLElement)) {
      return { error: "Matched element is not clickable.", ok: false };
    }
    el.click();
    return { element: summarize(el), ok: true };
  }

  if (request.action === "type") {
    const nextText = typeof request.value?.text === "string" ? request.value.text : "";
    const replaceExisting = request.value?.replaceExisting !== false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = replaceExisting ? nextText : `${el.value}${nextText}`;
      dispatchValueEvents(el);
      return { element: summarize(el), ok: true, value: el.type === "password" ? "<redacted>" : el.value };
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      if (replaceExisting) {
        el.textContent = nextText;
      } else {
        el.textContent = `${el.textContent || ""}${nextText}`;
      }
      dispatchValueEvents(el);
      return { element: summarize(el), ok: true };
    }
    return { error: "Matched element cannot receive typed text.", ok: false };
  }

  if (request.action === "select") {
    if (!(el instanceof HTMLSelectElement)) {
      return { error: "Matched element is not a select.", ok: false };
    }
    const requestedValue = typeof request.value?.value === "string" ? request.value.value : "";
    const requestedLabel = typeof request.value?.label === "string" ? request.value.label : "";
    const exact = request.value?.exact === true;
    const option = Array.from(el.options).find((candidate) => {
      if (requestedValue && candidate.value === requestedValue) return true;
      if (!requestedLabel) return false;
      return matchesText(candidate.textContent || "", requestedLabel, exact);
    });
    if (!option) {
      return { error: "No matching select option found.", ok: false };
    }
    el.value = option.value;
    dispatchValueEvents(el);
    return { element: summarize(el), label: option.textContent || "", ok: true, value: option.value };
  }

  if (request.action === "scroll") {
    const deltaX = typeof request.value?.deltaX === "number" ? request.value.deltaX : 0;
    const deltaY = typeof request.value?.deltaY === "number" ? request.value.deltaY : 700;
    if (el instanceof HTMLElement) {
      el.scrollBy({ behavior: "auto", left: deltaX, top: deltaY });
      return { element: summarize(el), ok: true };
    }
    window.scrollBy({ behavior: "auto", left: deltaX, top: deltaY });
    return { ok: true, scrollX: window.scrollX, scrollY: window.scrollY };
  }

  return { error: "Unsupported browser target action.", ok: false };
};

const waitForConditionScript = function(condition: {
  selector?: string;
  text?: string;
  urlIncludes?: string;
  urlMatches?: string;
}) {
  const checks: Array<{ matched: boolean; type: string }> = [];
  if (condition.urlIncludes) {
    checks.push({ matched: location.href.includes(condition.urlIncludes), type: "urlIncludes" });
  }
  if (condition.urlMatches) {
    let matched = false;
    try {
      matched = new RegExp(condition.urlMatches).test(location.href);
    } catch {
      matched = false;
    }
    checks.push({ matched, type: "urlMatches" });
  }
  if (condition.selector) {
    let matched = false;
    try {
      const el = document.querySelector(condition.selector);
      if (el) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        matched = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }
    } catch {
      matched = false;
    }
    checks.push({ matched, type: "selector" });
  }
  if (condition.text) {
    const pageText = (document.body?.innerText || "").toLowerCase();
    checks.push({ matched: pageText.includes(condition.text.toLowerCase()), type: "text" });
  }
  return {
    checks,
    matched: checks.length > 0 && checks.every((check) => check.matched),
    title: document.title,
    url: location.href
  };
};

function readTarget(value: unknown): BrowserTarget {
  if (!isRecord(value)) {
    throw new Error("A browser target object is required.");
  }
  return {
    axNodeId: readString(value.axNodeId),
    backendNodeId: readNumber(value.backendNodeId),
    exact: value.exact === true,
    index: clampInteger(readNumber(value.index) ?? 0, 0, 10000),
    ref: readString(value.ref) || readString(value.axNodeId),
    role: readString(value.role),
    selector: readString(value.selector),
    text: readString(value.text)
  };
}

function requiredString(value: unknown, message: string): string {
  const text = readString(value);
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function objectSchema(properties: Record<string, JsonValue>, required: string[] = []): JsonValue {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object"
  };
}

type CompactResultOptions = {
  maxArrayItems: number;
  maxDepth: number;
  maxObjectKeys: number;
  maxStringChars: number;
};

function formatToolResult(toolName: string, result: unknown): string {
  const compacted = compactToolResult(toolName, result);
  const serialized = stringifyToolResult(compacted);
  if (serialized.length <= maxToolResultChars) {
    return serialized;
  }

  const tighter = compactJsonValue(compacted, {
    maxArrayItems: 50,
    maxDepth: 6,
    maxObjectKeys: 80,
    maxStringChars: 600
  });
  const tightSerialized = stringifyToolResult({
    guidance: largeResultGuidance(toolName),
    maxChars: maxToolResultChars,
    originalChars: serialized.length,
    result: tighter,
    tool: toolName,
    truncated: true
  });
  if (tightSerialized.length <= maxToolResultChars) {
    return tightSerialized;
  }

  return stringifyToolResult({
    guidance: largeResultGuidance(toolName),
    maxChars: maxToolResultChars,
    originalChars: serialized.length,
    preview: truncateString(tightSerialized, 12_000),
    tool: toolName,
    truncated: true
  });
}

function compactToolResult(toolName: string, result: unknown): unknown {
  if (toolName === "browser_snapshot") {
    return compactSnapshotResult(result);
  }
  if (toolName === "browser_ax_snapshot") {
    return compactAxSnapshotResult(result);
  }
  if (toolName === "browser_ax_query") {
    return compactArrayResult(result, "matches", 80, 600);
  }
  if (toolName === "browser_events_read" || toolName === "browser_events_await") {
    return compactArrayResult(result, "events", 80, 800);
  }
  return compactJsonValue(result, defaultCompactResultOptions());
}

function compactSnapshotResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return compactJsonValue(result, defaultCompactResultOptions());
  }

  const elements = Array.isArray(result.elements) ? result.elements : [];
  const text = rawString(result.text);
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (key === "elements" || key === "text") {
      continue;
    }
    compacted[key] = compactJsonValue(value, {
      maxArrayItems: 40,
      maxDepth: 5,
      maxObjectKeys: 60,
      maxStringChars: 600
    });
  }

  if (text !== undefined) {
    compacted.text = truncateString(text, maxBrowserResultTextChars);
  }
  compacted.elements = elements
    .slice(0, maxSnapshotResultElements)
    .map((element) => compactJsonValue(element, {
      maxArrayItems: 20,
      maxDepth: 4,
      maxObjectKeys: 40,
      maxStringChars: 500
    }));
  compacted.elementCount = elements.length;

  const truncated: Record<string, unknown> = {};
  if (text !== undefined && text.length > maxBrowserResultTextChars) {
    truncated.textChars = text.length - maxBrowserResultTextChars;
  }
  if (elements.length > maxSnapshotResultElements) {
    truncated.elements = elements.length - maxSnapshotResultElements;
  }
  if (Object.keys(truncated).length > 0) {
    compacted.truncated = truncated;
  }
  return compacted;
}

function compactAxSnapshotResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return compactJsonValue(result, defaultCompactResultOptions());
  }

  const nodes = Array.isArray(result.nodes) ? result.nodes : [];
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (key === "nodes") {
      continue;
    }
    compacted[key] = compactJsonValue(value, {
      maxArrayItems: 40,
      maxDepth: 5,
      maxObjectKeys: 60,
      maxStringChars: 400
    });
  }
  compacted.nodes = nodes
    .slice(0, maxAxSnapshotResultNodes)
    .map((node) => compactJsonValue(node, {
      maxArrayItems: 80,
      maxDepth: 5,
      maxObjectKeys: 40,
      maxStringChars: 260
    }));
  compacted.nodeCount = nodes.length;
  if (nodes.length > maxAxSnapshotResultNodes) {
    compacted.truncated = {
      nodes: nodes.length - maxAxSnapshotResultNodes
    };
  }
  return compacted;
}

function compactArrayResult(result: unknown, key: string, maxItems: number, maxStringChars: number): unknown {
  if (!isRecord(result)) {
    return compactJsonValue(result, defaultCompactResultOptions());
  }

  const items = Array.isArray(result[key]) ? result[key] : [];
  const compacted: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(result)) {
    if (entryKey === key) {
      continue;
    }
    compacted[entryKey] = compactJsonValue(value, {
      maxArrayItems: 40,
      maxDepth: 5,
      maxObjectKeys: 60,
      maxStringChars
    });
  }
  compacted[key] = items
    .slice(0, maxItems)
    .map((item) => compactJsonValue(item, {
      maxArrayItems: 40,
      maxDepth: 5,
      maxObjectKeys: 60,
      maxStringChars
    }));
  compacted[`${key}Count`] = items.length;
  if (items.length > maxItems) {
    compacted.truncated = {
      [key]: items.length - maxItems
    };
  }
  return compacted;
}

function compactJsonValue(
  value: unknown,
  options: CompactResultOptions,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return truncateString(value, options.maxStringChars);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= options.maxDepth) {
    return {
      reason: "Maximum result depth reached.",
      truncated: true
    };
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const limit = Math.max(0, options.maxArrayItems);
    const items = value
      .slice(0, limit)
      .map((item) => compactJsonValue(item, options, depth + 1, seen));
    if (value.length > limit) {
      items.push({
        omittedItems: value.length - limit,
        truncated: true
      });
    }
    seen.delete(value);
    return items;
  }

  const entries = Object.entries(value);
  const compacted: Record<string, unknown> = {};
  for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
    compacted[key] = compactJsonValue(entryValue, options, depth + 1, seen);
  }
  if (entries.length > options.maxObjectKeys) {
    compacted.truncatedKeys = entries.length - options.maxObjectKeys;
  }
  seen.delete(value);
  return compacted;
}

function defaultCompactResultOptions(): CompactResultOptions {
  return {
    maxArrayItems: maxToolResultArrayItems,
    maxDepth: 8,
    maxObjectKeys: maxToolResultObjectKeys,
    maxStringChars: maxToolResultStringChars
  };
}

function stringifyToolResult(value: unknown): string {
  return JSON.stringify(value, null, 2) || "null";
}

function rawString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  let suffix = "\n[truncated]";
  for (let index = 0; index < 2; index += 1) {
    const keep = Math.max(0, maxChars - suffix.length);
    suffix = `\n[truncated ${value.length - keep} chars]`;
  }
  return `${value.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function largeResultGuidance(toolName: string): string {
  if (toolName === "browser_snapshot") {
    return "Result was compacted. Re-run browser_snapshot with lower maxElements/limit, page text with offset/limit, or use browser_ax_query to fetch targeted elements.";
  }
  if (toolName === "browser_ax_snapshot") {
    return "Result was compacted. Re-run browser_ax_snapshot with lower limit or scope=outline, or use browser_ax_query with role/name/text filters.";
  }
  if (toolName === "browser_ax_query") {
    return "Result was compacted. Re-run browser_ax_query with a lower limit or narrower role/name/text filters.";
  }
  if (toolName === "browser_events_read" || toolName === "browser_events_await") {
    return "Result was compacted. Read events with a lower limit/maxEvents or a more specific cursor/filter.";
  }
  return "Result was compacted before returning to the MCP client. Use narrower arguments or lower limits for more detail.";
}

function textResult(text: string): ToolCallResult {
  return {
    content: [{ text, type: "text" }]
  };
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result
  };
}

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return {
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(body);
}

function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > maxBytes) {
        reject(new Error("MCP request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
