import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      className={cn("block min-w-0 space-y-1 text-[12px] font-medium text-foreground", className)}
      ref={ref}
      {...props}
    />
  )
);

Label.displayName = "Label";

export { Label };
