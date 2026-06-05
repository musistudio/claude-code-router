import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface ProxyToggleProps {
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

export function ProxyToggle({ active, onActiveChange }: ProxyToggleProps) {
  const [status, setStatus] = useState<"online" | "offline" | "checking">("checking");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = async () => {
    try {
      const resp = await fetch("/api/health");
      if (resp.ok) {
        const data = await resp.json();
        const isRunning = data.status === "ok" || data.status === "running";
        setStatus(isRunning ? "online" : "offline");
        onActiveChange(isRunning);
      } else {
        setStatus("offline");
        onActiveChange(false);
      }
    } catch {
      setStatus("offline");
      onActiveChange(false);
    }
  };

  useEffect(() => {
    checkHealth();
    intervalRef.current = setInterval(checkHealth, 10000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          status === "online"
            ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
            : status === "offline"
              ? "bg-muted-foreground/40"
              : "bg-yellow-500 animate-pulse"
        )}
      />
      <span
        className={cn(
          status === "online"
            ? "text-green-600 dark:text-green-400"
            : status === "offline"
              ? "text-muted-foreground"
              : "text-yellow-600 dark:text-yellow-400"
        )}
      >
        {status === "online" ? "Active" : status === "offline" ? "Inactive" : "Checking..."}
      </span>
    </div>
  );
}
