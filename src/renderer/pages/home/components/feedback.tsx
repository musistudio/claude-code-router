import {
  AnimatePresence, AppToast, Check, motion, motionEase, reducedMotionTransition,
  useReducedMotion
} from "../shared";
export function LightToast({ toast }: { toast?: AppToast }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {toast ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none fixed left-1/2 top-5 z-[10000] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-3 py-2 text-[12px] font-medium text-popover-foreground shadow-lg"
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
