import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[12px] leading-4 text-foreground shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-muted-foreground/75 hover:border-muted-foreground/45 focus:border-primary/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted/35",
        className
      )}
      ref={ref}
      {...props}
      type={type}
    />
  )
);

Input.displayName = "Input";

export { Input };
