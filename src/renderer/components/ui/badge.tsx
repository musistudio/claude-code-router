import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "danger" | "default" | "outline" | "secondary" | "success" | "warning";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function badgeVariants({ className, variant = "default" }: { className?: string; variant?: BadgeVariant }) {
  return cn(
    "inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
    variant === "default" && "border-transparent bg-primary/10 text-primary",
    variant === "secondary" && "border-border bg-secondary text-secondary-foreground",
    variant === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    variant === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
    variant === "danger" && "border-red-200 bg-red-50 text-red-700",
    variant === "outline" && "border-border bg-background text-muted-foreground",
    className
  );
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span className={badgeVariants({ className, variant })} ref={ref} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
