import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
};

export interface SelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange" | "value"> {
  menuClassName?: string;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  selectClassName?: string;
  value?: string;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, disabled, menuClassName, onOpenChange, onValueChange, options, selectClassName, value, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});
    const listboxId = React.useId();
    const menuRef = React.useRef<HTMLDivElement>(null);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const selectedOption = options.find((option) => option.value === value) ?? options[0];
    const SelectedIcon = selectedOption?.icon;

    const updateMenuPosition = React.useCallback(() => {
      const root = rootRef.current;
      if (!root || typeof window === "undefined") return;

      const rect = root.getBoundingClientRect();
      const margin = 8;
      const maxWidth = Math.min(360, window.innerWidth - margin * 2);
      const menuWidth = Math.max(rect.width, Math.min(260, maxWidth));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin));
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const openAbove = below < 180 && above > below;
      const availableHeight = Math.max(160, openAbove ? above : below);

      setMenuStyle({
        bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
        left,
        maxHeight: availableHeight,
        maxWidth,
        minWidth: rect.width,
        position: "fixed",
        top: openAbove ? undefined : rect.bottom + 4,
        zIndex: 1000
      });
    }, []);

    React.useLayoutEffect(() => {
      onOpenChange?.(open);
      return () => {
        if (open) {
          onOpenChange?.(false);
        }
      };
    }, [onOpenChange, open]);

    React.useLayoutEffect(() => {
      if (!open) return;

      updateMenuPosition();
      window.addEventListener("resize", updateMenuPosition);
      window.addEventListener("scroll", updateMenuPosition, true);

      return () => {
        window.removeEventListener("resize", updateMenuPosition);
        window.removeEventListener("scroll", updateMenuPosition, true);
      };
    }, [open, updateMenuPosition]);

    React.useEffect(() => {
      if (!open) return;

      const closeOnOutsidePointer = (event: PointerEvent) => {
        const target = event.target as Node;
        if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
          setOpen(false);
        }
      };

      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("pointerdown", closeOnOutsidePointer);
      document.addEventListener("keydown", closeOnEscape);

      return () => {
        document.removeEventListener("pointerdown", closeOnOutsidePointer);
        document.removeEventListener("keydown", closeOnEscape);
      };
    }, [open]);

    const menu = open ? (
      <div
        className={cn(
          "macos-dropdown w-max overflow-y-auto overflow-x-hidden rounded-[10px] border border-border bg-popover p-1",
          menuClassName
        )}
        id={listboxId}
        ref={menuRef}
        role="listbox"
        style={menuStyle}
      >
        {options.map((option) => {
          const OptionIcon = option.icon;
          const selected = option.value === selectedOption?.value;

          return (
            <button
              aria-selected={selected}
              className={cn(
                "flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[12px] text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-45",
                selected && "bg-accent text-accent-foreground"
              )}
              disabled={option.disabled}
              key={option.value}
              onClick={() => {
                onValueChange?.(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {OptionIcon ? <OptionIcon className="h-[14px] w-[14px] shrink-0 text-primary" /> : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected ? <Check className="h-[13px] w-[13px] shrink-0 text-primary" /> : null}
            </button>
          );
        })}
      </div>
    ) : null;

    return (
      <div className={cn("relative inline-flex min-w-0", className)} ref={rootRef}>
        <button
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "inline-flex h-8 max-w-[220px] min-w-0 items-center gap-2 rounded-[7px] bg-card py-0 pl-2 pr-2 text-left text-[12px] font-medium text-foreground outline-none transition-[background-color,box-shadow] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
            selectClassName
          )}
          disabled={disabled}
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          ref={ref}
          role="combobox"
          type="button"
          {...props}
        >
          {SelectedIcon ? <SelectedIcon className="h-[15px] w-[15px] shrink-0 text-primary" /> : null}
          <span className="min-w-0 flex-1 truncate">{selectedOption?.label}</span>
          <ChevronDown className={cn("ml-auto h-[13px] w-[13px] shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : menu}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
