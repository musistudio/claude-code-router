import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked = false, className, disabled, onChange, onCheckedChange, ...props }, ref) => (
    <span className={cn("relative inline-flex h-4 w-4 shrink-0", className)}>
      <input
        aria-checked={checked}
        checked={checked}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded border border-input bg-background outline-none transition-[border-color,background-color,box-shadow] checked:border-primary checked:bg-primary hover:border-muted-foreground/45 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.target.checked);
        }}
        ref={ref}
        type="checkbox"
        {...props}
      />
      <Check className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100" />
    </span>
  )
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
