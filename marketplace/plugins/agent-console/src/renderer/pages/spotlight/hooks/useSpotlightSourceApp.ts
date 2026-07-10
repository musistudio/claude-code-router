import { useEffect, useState } from "react";
import { normalizeSpotlightSourceApp, type SpotlightSourceApp } from "../utils/source-app";

export function useSpotlightSourceApp() {
  const [sourceApp, setSourceApp] = useState<SpotlightSourceApp | null>(null);

  useEffect(() => {
    let canceled = false;

    window.agentConsole?.ipc.invoke<unknown>("agent-console:spotlight:get-source-app").then((payload) => {
      if (!canceled) {
        setSourceApp(normalizeSpotlightSourceApp(payload));
      }
    }).catch(() => {
      if (!canceled) {
        setSourceApp(null);
      }
    });

    const removeListener = window.agentConsole?.ipc.on("agent-console:spotlight:source-app", (payload) => {
      setSourceApp(normalizeSpotlightSourceApp(payload));
    });

    return () => {
      canceled = true;
      removeListener?.();
    };
  }, []);

  return sourceApp;
}
