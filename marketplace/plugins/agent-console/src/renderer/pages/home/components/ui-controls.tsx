import { useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  Circle,
  Plug,
  Settings,
  Shield,
  Sparkles,
  Zap,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageIntro({ body, icon: Icon, title }: { body: string; icon: LucideIcon; title: string }) {
  return (
    <section className="border-b border-border pb-3">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold leading-6">{title}</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-muted-foreground">{body}</p>
        </div>
      </div>
    </section>
  );
}

export function SideButton({
  active,
  collapsed,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn("flex h-9 items-center gap-2 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-card", active && "bg-card codex-elevated")}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {!collapsed ? <span>{label}</span> : null}
    </button>
  );
}

export function SidebarSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mt-3 border-t border-border pt-3">
      <div className="mb-2 px-4 text-[11px] font-medium uppercase text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-1 px-2">{children}</div>
    </section>
  );
}

export function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      className={cn("flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground", active && "bg-card text-foreground codex-elevated")}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function PanelTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      className={cn("flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground", active && "bg-card text-foreground codex-elevated")}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function HeaderSelect({
  ariaLabel,
  buttonClassName,
  onChange,
  options,
  placement = "bottom",
  renderOption,
  renderValue,
  variant = "bordered",
  value
}: {
  ariaLabel: string;
  buttonClassName?: string;
  onChange: (value: string) => void;
  options: string[];
  placement?: "bottom" | "top";
  renderOption?: (option: string, selected: boolean) => ReactNode;
  renderValue?: (value: string) => ReactNode;
  variant?: "bordered" | "plain";
  value: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex shrink-0">
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 max-w-[220px] items-center justify-between gap-1.5 rounded-md px-2 text-left text-[12px] outline-none transition-colors",
          variant === "bordered"
            ? "border border-border bg-card hover:bg-muted hover:text-foreground"
            : "border border-transparent bg-transparent hover:bg-muted hover:text-foreground",
          buttonClassName
        )}
        onClick={() => setOpen((next) => !next)}
        type="button"
      >
        <span className="flex min-w-0 flex-1 items-center">
          {renderValue ? renderValue(value) : <span className="min-w-0 truncate">{value}</span>}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} type="button" />
          <div
            className={cn(
              "codex-dialog absolute right-0 z-50 w-max min-w-full max-w-[min(280px,calc(100vw-32px))] rounded-md border border-border bg-popover p-1 codex-elevated",
              placement === "top" ? "bottom-full mb-1" : "mt-1"
            )}
          >
            {options.map((option) => (
              <button
                className={cn(
                  "flex h-8 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-[12px] text-popover-foreground hover:bg-muted hover:text-foreground",
                  option === value && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                type="button"
              >
                <span className="flex min-w-0 flex-1 items-center">
                  {renderOption ? renderOption(option, option === value) : <span className="min-w-0 truncate">{option}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/35 px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-[12px] font-medium">{value}</div>
    </div>
  );
}

export function UsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 codex-elevated">
      <div className="text-[22px] font-semibold leading-7">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ThreadStatusDot({ status }: { status: "idle" | "working" | "blocked" | "done" }) {
  const color = {
    idle: "text-sky-500",
    working: "text-emerald-500",
    blocked: "text-red-500",
    done: "text-neutral-400"
  }[status];
  return <Circle className={cn("mt-1.5 h-2 w-2 shrink-0 fill-current stroke-0", color)} />;
}

export function PluginStatusBadge({ status }: { status: "enabled" | "available" | "connected" | "disabled" }) {
  const variant = status === "enabled" || status === "connected" ? "success" : status === "available" ? "secondary" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

export function McpStatusBadge({ status }: { status: "connected" | "needs-auth" | "disabled" }) {
  const variant = status === "connected" ? "success" : status === "needs-auth" ? "warning" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export function SettingsIcon({ section }: { section: string }) {
  const iconMap: Record<string, LucideIcon> = {
    General: Settings,
    Agent: Bot,
    Approvals: Shield,
    Appearance: Sparkles,
    Integrations: Plug,
    Hooks: Zap
  };
  const Icon = iconMap[section] ?? Settings;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}
