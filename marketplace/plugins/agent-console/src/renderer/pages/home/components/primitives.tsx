import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { autoHeightSpringTransition, selectionSpringTransition } from "../utils/core";

export function AutoHeightMotion({
  children,
  className,
  contentClassName,
  onHeightChange
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onHeightChange?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateHeight = () => {
      setHeight(element.scrollHeight);
      onHeightChange?.();
    };
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [onHeightChange]);

  return (
    <motion.div
      animate={{ height, opacity: 1 }}
      className={cn("overflow-hidden", className)}
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      onAnimationComplete={onHeightChange}
      onUpdate={onHeightChange ? () => onHeightChange() : undefined}
      transition={autoHeightSpringTransition}
    >
      <div className={contentClassName} ref={contentRef}>{children}</div>
    </motion.div>
  );
}

export function AnimatedSelectionBackground({
  className,
  layoutId
}: {
  className?: string;
  layoutId: string;
}) {
  return (
    <motion.span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-md bg-accent", className)}
      layoutId={layoutId}
      transition={selectionSpringTransition}
    />
  );
}
