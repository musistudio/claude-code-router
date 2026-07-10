import type {
  ToolHubSandboxConsolePayload,
  ToolHubSandboxResultPayload,
  ToolHubSandboxRunPayload,
  ToolHubSandboxToolCallPayload
} from "../../../shared/toolhub-types";

type SandboxFrameState = {
  cleanup: () => void;
  frame: HTMLIFrameElement;
  requestId: string;
  timer: ReturnType<typeof setTimeout>;
};

const activeSandboxes = new Map<string, SandboxFrameState>();

export function initializeToolHubSandboxHost(): void {
  window.agentConsole?.ipc?.on?.("toolhub:sandbox:run", (payload) => {
    void runSandbox(payload as ToolHubSandboxRunPayload);
  });
}

async function runSandbox(payload: ToolHubSandboxRunPayload): Promise<void> {
  cleanupSandbox(payload.requestId);

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.left = "-9999px";
  frame.srcdoc = buildSandboxDocument();

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) {
      return;
    }
    const message = normalizeSandboxMessage(event.data);
    if (!message || message.requestId !== payload.requestId) {
      return;
    }

    if (message.type === "tool_call") {
      void handleToolCall(frame, message.payload);
      return;
    }

    if (message.type === "console") {
      void window.agentConsole?.ipc?.invoke?.("toolhub:sandbox:console", message.payload);
      return;
    }

    if (message.type === "result") {
      cleanupSandbox(payload.requestId);
      void window.agentConsole?.ipc?.invoke?.("toolhub:sandbox:result", message.payload);
    }
  };

  const cleanup = () => {
    window.removeEventListener("message", handleMessage);
    frame.remove();
  };
  const timer = setTimeout(() => {
    cleanupSandbox(payload.requestId);
    const result: ToolHubSandboxResultPayload = {
      requestId: payload.requestId,
      ok: false,
      error: `Workflow sandbox timed out after ${payload.timeoutMs}ms.`
    };
    void window.agentConsole?.ipc?.invoke?.("toolhub:sandbox:result", result);
  }, payload.timeoutMs);

  activeSandboxes.set(payload.requestId, {
    cleanup,
    frame,
    requestId: payload.requestId,
    timer
  });
  window.addEventListener("message", handleMessage);
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
  });
  frame.contentWindow?.postMessage(
    {
      type: "run",
      payload
    },
    "*"
  );
}

async function handleToolCall(frame: HTMLIFrameElement, payload: ToolHubSandboxToolCallPayload): Promise<void> {
  try {
    const result = await window.agentConsole?.ipc?.invoke?.("toolhub:sandbox:tool-call", payload);
    frame.contentWindow?.postMessage(
      {
        type: "tool_result",
        requestId: payload.requestId,
        toolCallId: payload.toolCallId,
        ok: true,
        result
      },
      "*"
    );
  } catch (error) {
    frame.contentWindow?.postMessage(
      {
        type: "tool_result",
        requestId: payload.requestId,
        toolCallId: payload.toolCallId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      "*"
    );
  }
}

function cleanupSandbox(requestId: string): void {
  const state = activeSandboxes.get(requestId);
  if (!state) {
    return;
  }
  clearTimeout(state.timer);
  state.cleanup();
  activeSandboxes.delete(requestId);
}

function normalizeSandboxMessage(value: unknown):
  | { payload: ToolHubSandboxConsolePayload; requestId: string; type: "console" }
  | { payload: ToolHubSandboxResultPayload; requestId: string; type: "result" }
  | { payload: ToolHubSandboxToolCallPayload; requestId: string; type: "tool_call" }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = record.type;
  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const requestId = typeof (payload as Record<string, unknown>).requestId === "string"
    ? (payload as Record<string, unknown>).requestId as string
    : "";
  if (!requestId) {
    return null;
  }
  if (type === "console" || type === "result" || type === "tool_call") {
    return {
      type,
      requestId,
      payload: payload as never
    };
  }
  return null;
}

function buildSandboxDocument(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body>
    <script>
      (() => {
        "use strict";
        const pending = new Map();
        let activeRequestId = "";
        let explicitResult = false;
        let toolCallSequence = 0;

        function send(type, payload) {
          window.parent.postMessage({ type, payload }, "*");
        }

        function serializeConsole(args) {
          return args.map((item) => {
            if (typeof item === "string") return item;
            try {
              return JSON.stringify(item);
            } catch {
              return String(item);
            }
          }).join(" ");
        }

        for (const level of ["debug", "error", "info", "log", "warn"]) {
          console[level] = (...args) => {
            send("console", { requestId: activeRequestId, level, text: serializeConsole(args) });
          };
        }

        function callTool(tool, args = {}) {
          if (typeof tool !== "string" || !tool.trim()) {
            return Promise.reject(new Error("Tool name must be a non-empty string."));
          }
          if (!args || typeof args !== "object" || Array.isArray(args)) {
            return Promise.reject(new Error("Tool arguments must be an object."));
          }
          const toolCallId = String(++toolCallSequence);
          const promise = new Promise((resolve, reject) => {
            pending.set(toolCallId, { resolve, reject });
          });
          send("tool_call", { requestId: activeRequestId, toolCallId, tool, args });
          return promise;
        }

        function definePath(root, parts, value) {
          let current = root;
          for (let index = 0; index < parts.length - 1; index += 1) {
            const part = parts[index];
            if (!current[part] || typeof current[part] !== "object") {
              current[part] = Object.create(null);
            }
            current = current[part];
          }
          current[parts[parts.length - 1]] = value;
        }

        function buildNamespaces(callableTools) {
          const mcp = Object.create(null);
          const topLevel = Object.create(null);
          for (const toolName of callableTools) {
            const parts = String(toolName).split(".").filter(Boolean);
            if (parts[0] === "mcp" && parts.length >= 3) {
              definePath(mcp, parts.slice(1), (args = {}) => callTool(toolName, args));
              definePath(topLevel, parts.slice(1), (args = {}) => callTool(toolName, args));
            }
          }
          return { mcp, topLevel };
        }

        function result(value) {
          explicitResult = true;
          return { __toolhubExplicitResult: true, value };
        }

        window.addEventListener("message", (event) => {
          const message = event.data;
          if (!message || typeof message !== "object") return;
          if (message.type === "tool_result") {
            const pendingCall = pending.get(message.toolCallId);
            if (!pendingCall) return;
            pending.delete(message.toolCallId);
            if (message.ok) {
              pendingCall.resolve(message.result);
            } else {
              pendingCall.reject(new Error(typeof message.error === "string" ? message.error : "Tool call failed"));
            }
            return;
          }
          if (message.type !== "run") return;
          const payload = message.payload || {};
          activeRequestId = String(payload.requestId || "");
          const callableTools = Array.isArray(payload.callableTools) ? payload.callableTools : [];
          const namespaces = buildNamespaces(callableTools);
          const tools = Object.freeze({ call: callTool });
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          Promise.resolve().then(async () => {
            const fn = new AsyncFunction(
              "callTool",
              "tools",
              "mcp",
              "result",
              "input",
              '"use strict";\\nconst window = undefined, document = undefined, parent = undefined, top = undefined, frames = undefined, localStorage = undefined, sessionStorage = undefined, indexedDB = undefined, XMLHttpRequest = undefined, fetch = undefined, WebSocket = undefined, EventSource = undefined, Worker = undefined, SharedWorker = undefined, importScripts = undefined;\\n' + String(payload.code || "")
            );
            const output = await fn.call(undefined, callTool, tools, Object.freeze(namespaces.mcp), result, {});
            if (output && typeof output === "object" && output.__toolhubExplicitResult) {
              explicitResult = true;
              return output.value;
            }
            return output;
          }).then((value) => {
            send("result", { requestId: activeRequestId, ok: true, result: value, explicitResult });
          }).catch((error) => {
            send("result", { requestId: activeRequestId, ok: false, error: error && error.message ? error.message : String(error) });
          });
        });
      })();
    </script>
  </body>
</html>`;
}

