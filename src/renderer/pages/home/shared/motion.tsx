import type { HTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ViewId } from "./types";

export const motionEase = [0.22, 1, 0.36, 1] as const;
export const reducedMotionTransition = { duration: 0.12, ease: "easeOut" } as const;
export const pageSpringTransition = { damping: 34, mass: 0.78, stiffness: 420, type: "spring" } as const;
export const listSpringTransition = { damping: 32, mass: 0.62, stiffness: 500, type: "spring" } as const;
export const disclosureSpringTransition = { damping: 36, mass: 0.7, stiffness: 480, type: "spring" } as const;

export type MotionSafeDivAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onAnimationStart" | "onDrag" | "onDragCapture" | "onDragEnd" | "onDragEndCapture" | "onDragStart" | "onDragStartCapture"
>;

export function ViewMotionShell({ children, view }: { children: ReactNode; view: ViewId }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="h-full min-h-0"
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.995, y: -6 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.995, y: 10 }}
      transition={shouldReduceMotion ? reducedMotionTransition : pageSpringTransition}
      data-view={view}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({ children, className, ...props }: MotionSafeDivAttributes) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      layout="position"
      transition={shouldReduceMotion ? reducedMotionTransition : listSpringTransition}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedDisclosure({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={shouldReduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
      className={cn("overflow-hidden", className)}
      exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={shouldReduceMotion ? reducedMotionTransition : disclosureSpringTransition}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedFieldSlot({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      layout
      transition={shouldReduceMotion ? reducedMotionTransition : disclosureSpringTransition}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedPopover({
  children,
  className,
  placement = "below",
  ...props
}: MotionSafeDivAttributes & { placement?: "above" | "below" }) {
  const shouldReduceMotion = useReducedMotion();
  const y = placement === "above" ? 4 : -4;

  return (
    <motion.div
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      className={className}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y }}
      transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.12, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedIconSwap({
  children,
  className,
  iconKey
}: {
  children: ReactNode;
  className?: string;
  iconKey: string | number | boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          className="inline-flex items-center justify-center"
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          key={String(iconKey)}
          transition={shouldReduceMotion ? reducedMotionTransition : { duration: 0.12, ease: "easeOut" }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
