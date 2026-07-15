import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-20 w-full resize-none rounded-[7px] border border-input bg-card px-3 py-2 text-[13px] leading-5 text-foreground shadow-[inset_0_1px_1px_rgba(0,0,0,.025)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export { Textarea };
