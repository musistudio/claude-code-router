import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type TooltipSide = "bottom" | "left" | "right" | "top";
type TooltipAlign = "center" | "end" | "start";

type TooltipPosition = {
  left: number;
  top: number;
};

const tooltipViewportMargin = 12;
const tooltipDefaultSize = {
  height: 32,
  width: 180
};

const useClientLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export interface TooltipPortalProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
}

const TooltipPortal = React.forwardRef<HTMLDivElement, TooltipPortalProps>(
  ({ children, className, open = true, role = "tooltip", ...props }, ref) => {
    if (!open || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <div
        className={cn(
          "pointer-events-none fixed z-[200] max-w-[min(260px,calc(100vw-24px))] rounded-md border border-border/70 bg-popover px-2 py-1 text-[11px] font-medium leading-4 text-popover-foreground shadow-card-elevated ring-1 ring-black/5",
          className
        )}
        ref={ref}
        role={role}
        {...props}
      >
        {children}
      </div>,
      document.body
    );
  }
);

TooltipPortal.displayName = "TooltipPortal";

export interface TooltipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "content"> {
  align?: TooltipAlign;
  children?: React.ReactNode;
  content: React.ReactNode;
  contentClassName?: string;
  disabled?: boolean;
  gap?: number;
  interactive?: boolean;
  side?: TooltipSide;
}

function Tooltip({
  align = "center",
  children,
  className,
  content,
  contentClassName,
  disabled = false,
  gap = 8,
  interactive = false,
  side = "top",
  ...props
}: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeTimerRef = React.useRef<number | undefined>(undefined);
  const contentActiveRef = React.useRef(false);
  const triggerActiveRef = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<TooltipPosition>();

  const updatePosition = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const contentRect = contentRef.current?.getBoundingClientRect();
    const contentSize = contentRect
      ? { height: contentRect.height, width: contentRect.width }
      : tooltipDefaultSize;

    setPosition(resolveTooltipPosition({
      align,
      contentHeight: contentSize.height,
      contentWidth: contentSize.width,
      gap,
      side,
      triggerRect
    }));
  }, [align, gap, side]);

  const show = React.useCallback(() => {
    if (disabled) {
      return;
    }
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    setOpen(true);
    updatePosition();
  }, [disabled, updatePosition]);

  const closeIfInactive = React.useCallback(() => {
    if (!interactive || (!triggerActiveRef.current && !contentActiveRef.current)) {
      setOpen(false);
    }
  }, [interactive]);

  const hide = React.useCallback(() => {
    if (!interactive || typeof window === "undefined") {
      setOpen(false);
      return;
    }
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(closeIfInactive, 80);
  }, [closeIfInactive, interactive]);

  const handleTriggerEnter = React.useCallback(() => {
    triggerActiveRef.current = true;
    show();
  }, [show]);

  const handleTriggerLeave = React.useCallback(() => {
    triggerActiveRef.current = false;
    hide();
  }, [hide]);

  const handleContentEnter = React.useCallback(() => {
    contentActiveRef.current = true;
    show();
  }, [show]);

  const handleContentLeave = React.useCallback(() => {
    contentActiveRef.current = false;
    hide();
  }, [hide]);

  useClientLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, updatePosition, content]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  React.useEffect(() => () => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  return (
    <span
      {...props}
      className={cn("inline-flex shrink-0", className)}
      data-ui-tooltip-trigger=""
      onBlur={handleTriggerLeave}
      onFocus={handleTriggerEnter}
      onMouseEnter={handleTriggerEnter}
      onMouseLeave={handleTriggerLeave}
      ref={triggerRef}
    >
      {children}
      <TooltipPortal
        className={cn(interactive && "pointer-events-auto", contentClassName)}
        onBlur={handleContentLeave}
        onFocus={handleContentEnter}
        onMouseEnter={handleContentEnter}
        onMouseLeave={handleContentLeave}
        open={open && Boolean(position)}
        ref={contentRef}
        style={position ? { left: position.left, top: position.top } : undefined}
      >
        {content}
      </TooltipPortal>
    </span>
  );
}

function resolveTooltipPosition({
  align,
  contentHeight,
  contentWidth,
  gap,
  side,
  triggerRect
}: {
  align: TooltipAlign;
  contentHeight: number;
  contentWidth: number;
  gap: number;
  side: TooltipSide;
  triggerRect: DOMRect;
}): TooltipPosition {
  const resolvedSide = resolveTooltipSide({
    contentHeight,
    contentWidth,
    gap,
    side,
    triggerRect
  });

  let left = triggerRect.left;
  let top = triggerRect.top;

  if (resolvedSide === "top" || resolvedSide === "bottom") {
    if (align === "start") {
      left = triggerRect.left;
    } else if (align === "end") {
      left = triggerRect.right - contentWidth;
    } else {
      left = triggerRect.left + triggerRect.width / 2 - contentWidth / 2;
    }
    top = resolvedSide === "top"
      ? triggerRect.top - contentHeight - gap
      : triggerRect.bottom + gap;
  } else {
    if (align === "start") {
      top = triggerRect.top;
    } else if (align === "end") {
      top = triggerRect.bottom - contentHeight;
    } else {
      top = triggerRect.top + triggerRect.height / 2 - contentHeight / 2;
    }
    left = resolvedSide === "left"
      ? triggerRect.left - contentWidth - gap
      : triggerRect.right + gap;
  }

  return {
    left: clampTooltipCoordinate(left, contentWidth, window.innerWidth),
    top: clampTooltipCoordinate(top, contentHeight, window.innerHeight)
  };
}

function resolveTooltipSide({
  contentHeight,
  contentWidth,
  gap,
  side,
  triggerRect
}: {
  contentHeight: number;
  contentWidth: number;
  gap: number;
  side: TooltipSide;
  triggerRect: DOMRect;
}): TooltipSide {
  if (side === "top" && triggerRect.top - contentHeight - gap < tooltipViewportMargin) {
    return "bottom";
  }
  if (side === "bottom" && triggerRect.bottom + contentHeight + gap > window.innerHeight - tooltipViewportMargin) {
    return "top";
  }
  if (side === "left" && triggerRect.left - contentWidth - gap < tooltipViewportMargin) {
    return "right";
  }
  if (side === "right" && triggerRect.right + contentWidth + gap > window.innerWidth - tooltipViewportMargin) {
    return "left";
  }
  return side;
}

function clampTooltipCoordinate(value: number, size: number, viewportSize: number): number {
  const max = Math.max(tooltipViewportMargin, viewportSize - size - tooltipViewportMargin);
  return Math.min(Math.max(tooltipViewportMargin, value), max);
}

export { Tooltip, TooltipPortal };
