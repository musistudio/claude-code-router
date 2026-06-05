import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Server, Wrench, Activity, Database, DollarSign } from "lucide-react";

export type ViewName = "dashboard" | "providers" | "tools" | "monitoring" | "cache" | "budget";

interface ViewTab {
  id: ViewName;
  labelKey: string;
  fallbackLabel: string;
  icon: React.ElementType;
}

const viewTabs: ViewTab[] = [
  { id: "dashboard", labelKey: "app.dashboard", fallbackLabel: "Dashboard", icon: LayoutDashboard },
  { id: "providers", labelKey: "app.providers", fallbackLabel: "Providers", icon: Server },
  { id: "tools", labelKey: "app.pipeline", fallbackLabel: "Tools", icon: Wrench },
  { id: "monitoring", labelKey: "app.monitoring", fallbackLabel: "Monitoring", icon: Activity },
  { id: "cache", labelKey: "app.cache", fallbackLabel: "Cache", icon: Database },
  { id: "budget", labelKey: "app.budget", fallbackLabel: "Budget", icon: DollarSign },
];

interface ViewTabsProps {
  activeView: ViewName;
  onViewChange: (view: ViewName) => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex items-center bg-muted rounded-xl p-1 gap-1">
      {viewTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-200",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{t(tab.labelKey, tab.fallbackLabel)}</span>
          </button>
        );
      })}
    </div>
  );
}
