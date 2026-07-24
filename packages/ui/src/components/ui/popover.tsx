import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("rounded-md border border-border bg-popover text-popover-foreground shadow-card-elevated", className)}
      ref={ref}
      {...props}
    />
  )
);

PopoverContent.displayName = "PopoverContent";

export interface PopoverPortalProps {
  children: React.ReactNode;
  open?: boolean;
}

function PopoverPortal({ children, open = true }: PopoverPortalProps) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

export { PopoverContent, PopoverPortal };
