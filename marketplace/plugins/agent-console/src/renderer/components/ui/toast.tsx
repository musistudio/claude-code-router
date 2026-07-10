import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "error" | "info" | "success" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastInput = {
  actions?: ToastAction[];
  content?: ReactNode;
  durationMs?: number;
  title: ReactNode;
  variant?: ToastVariant;
};

type ToastRecord = ToastInput & {
  id: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  dismissToast: (id: string) => void;
  showToast: (toast: ToastInput) => string;
  success: (toast: Omit<ToastInput, "variant">) => string;
  error: (toast: Omit<ToastInput, "variant">) => string;
  warning: (toast: Omit<ToastInput, "variant">) => string;
  info: (toast: Omit<ToastInput, "variant">) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const defaultToastDurationMs = 5000;
const toastViewportMaxHeight = "min(70vh, calc(100vh - 32px))";
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const id = `toast-${nextToastId++}`;
    const nextToast: ToastRecord = {
      ...toast,
      id,
      variant: toast.variant ?? "info"
    };

    setToasts((currentToasts) => [...currentToasts, nextToast]);
    return id;
  }, []);

  const dismissTopToast = useCallback(() => {
    setToasts((currentToasts) => currentToasts.slice(1));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      dismissToast,
      error: (toast) => showToast({ ...toast, variant: "error" }),
      info: (toast) => showToast({ ...toast, variant: "info" }),
      showToast,
      success: (toast) => showToast({ ...toast, variant: "success" }),
      warning: (toast) => showToast({ ...toast, variant: "warning" })
    }),
    [dismissToast, showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport dismissToast={dismissToast} dismissTopToast={dismissTopToast} toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

function ToastViewport({
  dismissToast,
  dismissTopToast,
  toasts
}: {
  dismissToast: (id: string) => void;
  dismissTopToast: () => void;
  toasts: ToastRecord[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || toasts.length <= 1) return;
    if (viewport.scrollHeight > viewport.clientHeight + 1) {
      dismissTopToast();
    }
  }, [dismissTopToast, toasts]);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 overflow-hidden"
      ref={viewportRef}
      style={{ maxHeight: toastViewportMaxHeight }}
    >
      {toasts.map((toast) => (
        <ToastCard dismissToast={dismissToast} key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({
  dismissToast,
  toast
}: {
  dismissToast: (id: string) => void;
  toast: ToastRecord;
}) {
  const timeoutRef = useRef<number | null>(null);
  const { Icon, iconClassName } = getToastVariantStyle(toast.variant);

  useEffect(() => {
    const durationMs = toast.durationMs ?? defaultToastDurationMs;
    if (durationMs <= 0) return undefined;

    timeoutRef.current = window.setTimeout(() => dismissToast(toast.id), durationMs);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [dismissToast, toast.durationMs, toast.id]);

  const dismiss = () => dismissToast(toast.id);

  return (
    <section
      className={cn(
        "codex-toast pointer-events-auto group relative overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-[0_12px_30px_rgba(15,23,42,.18)]",
        "animate-[codex-toast-enter_.18s_var(--cubic-enter)]"
      )}
      role={toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"}
    >
      <button
        aria-label="Close notification"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        onClick={dismiss}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex gap-3 px-3.5 py-3 pr-10">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClassName)} />
        <div className="min-w-0 flex-1">
          <div className="min-w-0 truncate text-[13px] font-semibold leading-5">{toast.title}</div>
          {toast.content ? <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted-foreground">{toast.content}</div> : null}
        </div>
      </div>

      {toast.actions?.length ? (
        <div className="flex min-h-10 items-center justify-end gap-2 border-t border-border bg-secondary/45 px-3 py-2">
          {toast.actions.map((action) => (
            <button
              className="h-7 rounded border border-border bg-card px-2.5 text-[12px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={action.label}
              onClick={() => {
                action.onClick();
                dismiss();
              }}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getToastVariantStyle(variant: ToastVariant): {
  Icon: LucideIcon;
  iconClassName: string;
} {
  if (variant === "success") {
    return {
      Icon: CheckCircle2,
      iconClassName: "text-[#12805c]"
    };
  }
  if (variant === "error") {
    return {
      Icon: AlertCircle,
      iconClassName: "text-destructive"
    };
  }
  if (variant === "warning") {
    return {
      Icon: TriangleAlert,
      iconClassName: "text-[#b7791f]"
    };
  }

  return {
    Icon: Info,
    iconClassName: "text-primary"
  };
}
