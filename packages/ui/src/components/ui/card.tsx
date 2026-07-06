import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-shadow duration-200", className)}
      ref={ref}
      style={{
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.5)",
        ...style
      }}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("flex min-h-12 flex-col justify-center border-b border-border/60 px-4 py-3", className)} ref={ref} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 className={cn("truncate text-[13px] font-semibold leading-5 tracking-[-0.01em]", className)} ref={ref} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("p-4", className)} ref={ref} {...props} />
  )
);
CardContent.displayName = "CardContent";

export { Card, CardContent, CardHeader, CardTitle };
