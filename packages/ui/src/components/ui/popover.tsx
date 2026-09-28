import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { DialogScopeContext } from "./dialog";

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
  const dialogScope = React.useContext(DialogScopeContext);
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(<div className="contents" data-ui-dialog-owner={dialogScope?.id}>{children}</div>, document.body);
}

export { PopoverContent, PopoverPortal };
