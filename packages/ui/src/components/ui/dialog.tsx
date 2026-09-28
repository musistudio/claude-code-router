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

const DialogStackContext = React.createContext(0);
export const DialogScopeContext = React.createContext<{ id: string; titleId: string } | null>(null);
const dialogRootSelector = "[data-ui-dialog-root]";

function dialogFocusTargets(root: HTMLElement): HTMLElement[] {
  const portals = Array.from(root.ownerDocument.querySelectorAll<HTMLElement>("[data-ui-dialog-owner]"))
    .filter((portal) => portal.dataset.uiDialogOwner === root.id);
  return [root, ...portals].flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>(
    'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]'
  ))).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
    !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

function dialogOwnsElement(root: HTMLElement, element: Element | null): boolean {
  return Boolean(element && (root.contains(element) || element.closest<HTMLElement>("[data-ui-dialog-owner]")?.dataset.uiDialogOwner === root.id));
}

function isTopMostDialogRoot(dialogElement: HTMLElement | null | undefined): boolean {
  if (!dialogElement) {
    return false;
  }

  const dialogRoots = Array.from(dialogElement.ownerDocument.querySelectorAll<HTMLElement>(dialogRootSelector));
  return dialogRoots[dialogRoots.length - 1] === dialogElement;
}

function DialogStackLayer({
  children,
  depth = 0
}: {
  children: React.ReactNode;
  depth?: number;
}) {
  return <DialogStackContext.Provider value={depth}>{children}</DialogStackContext.Provider>;
}

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
  const rootRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const scope = React.useMemo(() => ({ id, titleId: `${id}-title` }), [id]);
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const dialogElement = rootRef.current;
    const ownerDocument = dialogElement?.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument || !dialogElement) {
      return;
    }

    const previousFocus = ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    const focusFirst = () => {
      const target = dialogFocusTargets(dialogElement)[0] ?? dialogElement.querySelector<HTMLElement>('[role="dialog"]');
      target?.focus({ preventScroll: true });
    };
    if (isTopMostDialogRoot(dialogElement) && !dialogOwnsElement(dialogElement, ownerDocument.activeElement)) {
      focusFirst();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTopMostDialogRoot(dialogElement)) {
        return;
      }
      if (event.key === "Escape") {
        // Portalled menus handle Escape themselves before their owning dialog.
        if (Array.from(ownerDocument.querySelectorAll<HTMLElement>("[data-ui-dialog-owner]"))
          .some((portal) => portal.dataset.uiDialogOwner === dialogElement.id && portal.childElementCount > 0)) {
          return;
        }
        event.preventDefault();
        onOpenChangeRef.current?.(false);
      } else if (event.key === "Tab") {
        const targets = dialogFocusTargets(dialogElement);
        const index = targets.indexOf(ownerDocument.activeElement as HTMLElement);
        if (targets.length === 0) {
          event.preventDefault();
          focusFirst();
        } else if (index < 0 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
          event.preventDefault();
          targets[event.shiftKey ? targets.length - 1 : 0].focus();
        }
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isTopMostDialogRoot(dialogElement) && !dialogOwnsElement(dialogElement, event.target as Element)) {
        focusFirst();
      }
    };

    ownerDocument.addEventListener("keydown", handleKeyDown);
    ownerDocument.addEventListener("focusin", handleFocusIn);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      ownerDocument.removeEventListener("focusin", handleFocusIn);
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <DialogScopeContext.Provider value={scope}>
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/28 p-3 sm:p-6", className)}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented && event.target === event.currentTarget) {
          onOpenChange?.(false);
        }
      }}
      transition={shouldReduceMotion ? { duration: 0.12, ease: "easeOut" } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      data-ui-dialog-root=""
      id={id}
      ref={rootRef}
      {...props}
    >
      {children}
    </motion.div>
    </DialogScopeContext.Provider>
  );
}

export interface DialogContentProps extends MotionSafeSectionAttributes {}

const DialogContent = React.forwardRef<HTMLElement, DialogContentProps>(
  ({ className, ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const stackDepth = React.useContext(DialogStackContext);
    const scope = React.useContext(DialogScopeContext);
    const stackedScale = Math.max(0.96, 1 - stackDepth * 0.015);

    return (
      <motion.section
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: stackDepth > 0 ? stackedScale : 1, y: 0 }}
        aria-hidden={stackDepth > 0 ? true : undefined}
        aria-modal={stackDepth > 0 ? undefined : true}
        aria-labelledby={props["aria-label"] ? undefined : scope?.titleId}
        className={cn("flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl", className)}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 14 }}
        ref={ref}
        role="dialog"
        tabIndex={-1}
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
  ({ className, ...props }, ref) => {
    const scope = React.useContext(DialogScopeContext);
    return <h2 className={cn("truncate text-[14px] font-semibold", className)} id={scope?.titleId} ref={ref} {...props} />;
  }
);

DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground", className)} ref={ref} {...props} />
  )
);

DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogStackLayer,
  DialogTitle
};
