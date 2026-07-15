import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      className={cn(
        "flex h-8 w-full rounded-[7px] border border-input bg-card px-3 text-[12px] text-foreground shadow-[inset_0_1px_1px_rgba(0,0,0,.025)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  )
);

Input.displayName = "Input";

export { Input };
