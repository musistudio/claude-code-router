import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type MotionSafeDivAttributes = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onAnimationStart" | "onDrag" | "onDragCapture" | "onDragEnd" | "onDragEndCapture" | "onDragStart" | "onDragStartCapture"
>;

type MotionSafeSectionAttributes = Omit<
  React.HTMLAttributes<HTMLElement>,
  "onAnimationStart" | "onDrag" | "onDragCapture" | "onDragEnd" | "onDragEndCapture" | "onDragStart" | "onDragStartCapture"
>;

export interface DialogProps extends MotionSafeDivAttributes {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

function Dialog({
  children,
  className,
  onMouseDown,
  onOpenChange,
  open = true,
  ...props
}: DialogProps) {
  const shouldReduceMotion = useReducedMotion();

  if (!open) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/28 p-3 sm:p-6", className)}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented && event.target === event.currentTarget) {
          onOpenChange?.(false);
        }
      }}
      transition={shouldReduceMotion ? { duration: 0.12, ease: "easeOut" } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface DialogContentProps extends MotionSafeSectionAttributes {}

const DialogContent = React.forwardRef<HTMLElement, DialogContentProps>(
  ({ className, ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion();

    return (
      <motion.section
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-modal="true"
        className={cn("flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl", className)}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 14 }}
        ref={ref}
        role="dialog"
        transition={shouldReduceMotion ? { duration: 0.12, ease: "easeOut" } : { type: "spring", stiffness: 520, damping: 38, mass: 0.75 }}
        {...props}
      />
    );
  }
);

DialogContent.displayName = "DialogContent";

const DialogHeader = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <header
      className={cn("flex h-12 shrink-0 items-center justify-between border-b border-border px-4", className)}
      ref={ref}
      {...props}
    />
  )
);

DialogHeader.displayName = "DialogHeader";

const DialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("min-h-0 flex-1 overflow-auto p-4", className)} ref={ref} {...props} />
  )
);

DialogBody.displayName = "DialogBody";

const DialogFooter = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <footer
      className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3", className)}
      ref={ref}
      {...props}
    />
  )
);

DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 className={cn("truncate text-[13px] font-semibold", className)} ref={ref} {...props} />
  )
);

DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground", className)} ref={ref} {...props} />
  )
);

DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
