import * as React from "react";
import {
  AnimatePresence, AppToast, Button, Check, CircleAlert, cn, LoaderCircle, motion, motionEase, reducedMotionTransition,
  useAppText, useReducedMotion, X
} from "../shared/index";

export function PersistenceFeedback({ actionError, contained = false, disconnected, error, inline = false, onDismissAction, onRetry, state }: {
  actionError: string;
  contained?: boolean;
  disconnected: boolean;
  error: string;
  inline?: boolean;
  onDismissAction: () => void;
  onRetry: () => void;
  state: "idle" | "saving" | "saved" | "error";
}) {
  const t = useAppText();
  const [showSaved, setShowSaved] = React.useState(false);
  React.useEffect(() => {
    setShowSaved(state === "saved");
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setShowSaved(false), 3000);
    return () => window.clearTimeout(timer);
  }, [state]);
  const failed = state === "error";
  const message = failed ? t("Changes have not been saved.") : disconnected ? t("Connection lost. Status may be out of date.") : actionError;
  if (!message && state !== "saving" && !showSaved) return null;
  return (
    <div className={cn(
      "border-border bg-popover px-4 py-3 text-[13px] text-popover-foreground",
      inline
        ? "shrink-0 border-t"
        : contained
          ? "pointer-events-auto w-max max-w-full rounded-lg border shadow-lg"
          : "pointer-events-auto fixed left-1/2 top-5 z-[10000] w-max max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-lg border shadow-lg"
    )} role={message ? "alert" : "status"}>
      <div className="flex items-center gap-3">
        {message ? <CircleAlert className="h-4 w-4 shrink-0 text-destructive" /> : state === "saving" ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <Check className="h-4 w-4 shrink-0 text-primary" />}
        <span>{message || t(state === "saving" ? "Saving changes…" : "Changes saved.")}</span>
        {failed ? <Button onClick={onRetry} size="sm" variant="outline">{t("Retry saving")}</Button> : actionError && !disconnected ? <Button aria-label={t("Dismiss")} onClick={onDismissAction} size="iconSm" variant="ghost"><X className="h-4 w-4" /></Button> : null}
      </div>
      {failed && error ? <details className="mt-2 text-[12px] text-muted-foreground"><summary className="cursor-pointer">{t("Technical details")}</summary><p className="mt-1 max-h-24 overflow-auto break-words">{error}</p></details> : null}
    </div>
  );
}
export function FeedbackStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-5 z-[10000] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col items-center gap-3">
      {children}
    </div>
  );
}

export function LightToast({ contained = false, toast }: { contained?: boolean; toast?: AppToast }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {toast ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "pointer-events-none flex items-center gap-2 rounded-full border border-border bg-popover px-3 py-2 text-[12px] font-medium text-popover-foreground shadow-lg",
            contained ? "max-w-full" : "fixed left-1/2 top-5 z-[10000] max-w-[calc(100vw-24px)] -translate-x-1/2"
          )}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          key={toast.id}
          role="status"
          transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.16, ease: motionEase }}
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{toast.message}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
