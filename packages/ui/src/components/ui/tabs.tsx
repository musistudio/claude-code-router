import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  onValueChange?: (value: string) => void;
  value?: string;
};

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  onValueChange?: (value: string) => void;
  value?: string;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ children, className, onValueChange, value, ...props }, ref) => (
    <TabsContext.Provider value={{ onValueChange, value }}>
      <div className={cn("min-w-0", className)} ref={ref} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
);

Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "inline-flex min-w-0 items-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      ref={ref}
      role="tablist"
      {...props}
    />
  )
);

TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, onClick, value, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const selected = context?.value === value;

    return (
      <button
        aria-selected={selected}
        className={cn(
          "inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-[12px] font-medium outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
          className
        )}
        data-state={selected ? "active" : "inactive"}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            context?.onValueChange?.(value);
          }
        }}
        ref={ref}
        role="tab"
        type="button"
        {...props}
      />
    );
  }
);

TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const selected = context?.value === value;

    return (
      <div
        className={cn("min-w-0 outline-none", className)}
        data-state={selected ? "active" : "inactive"}
        hidden={!selected}
        ref={ref}
        role="tabpanel"
        {...props}
      />
    );
  }
);

TabsContent.displayName = "TabsContent";

export { Tabs, TabsContent, TabsList, TabsTrigger };
