import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "destructive" | "ghost" | "outline" | "secondary" | "subtle";
type ButtonSize = "default" | "icon" | "iconSm" | "sm";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color" | "size"> {
  size?: ButtonSize;
  unstyled?: boolean;
  variant?: ButtonVariant;
}

function buttonVariants({
  className,
  size = "default",
  variant = "default"
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[12px] font-medium leading-4 outline-none transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-45",
    variant === "default" && "border-primary/70 bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(15,118,110,0.2),inset_0_1px_0_rgba(255,255,255,0.14)] hover:border-primary hover:bg-primary/90 active:bg-primary/80",
    variant === "secondary" && "border-border bg-secondary text-secondary-foreground shadow-[0_1px_1px_rgba(0,0,0,.04)] hover:bg-muted",
    variant === "ghost" && "border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    variant === "outline" && "border-input bg-background text-foreground shadow-[0_1px_1px_rgba(0,0,0,.03)] hover:border-muted-foreground/45 hover:bg-muted/55",
    variant === "destructive" && "border-destructive/80 bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    variant === "subtle" && "border-transparent bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
    size === "sm" && "h-7 px-2 text-[11px]",
    size === "default" && "h-8 px-3",
    size === "icon" && "h-8 w-8 px-0",
    size === "iconSm" && "h-7 w-7 px-0",
    className
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, size = "default", type, unstyled = false, variant = "default", ...props }, ref) => {
    if (unstyled) {
      return <button className={className} ref={ref} type={type ?? "button"} {...props}>{children}</button>;
    }

    return (
      <button
        className={buttonVariants({ className, size, variant })}
        ref={ref}
        type={type ?? "button"}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
