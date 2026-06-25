import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "block min-h-[80px] w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-[12px] leading-5 text-foreground shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-muted-foreground/75 hover:border-muted-foreground/45 focus:border-primary/60 focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export { Textarea };
