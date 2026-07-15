import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border border-transparent px-3 text-[12px] font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(0,0,0,.1)] hover:brightness-[1.04]",
        secondary: "border-border bg-card text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        outline: "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/95",
        subtle: "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
      },
      size: {
        sm: "h-7 rounded-md px-2 text-[11px]",
        default: "h-8 px-3",
        icon: "h-7 w-7 px-0",
        iconSm: "h-7 w-7 px-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
