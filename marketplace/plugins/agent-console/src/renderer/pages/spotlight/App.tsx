import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { SpotlightSearch } from "./components/SpotlightSearch";
import { useSpotlightSourceApp } from "./hooks/useSpotlightSourceApp";
import { useSpotlightVisibility } from "./hooks/useSpotlightVisibility";

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const sourceApp = useSpotlightSourceApp();
  const shown = useSpotlightVisibility(inputRef);
  const trimmedQuery = query.trim();

  const hideSpotlight = useCallback(async () => {
    await window.agentConsole?.ipc.invoke("agent-console:spotlight:hide");
  }, []);

  const openMain = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await window.agentConsole?.ipc.invoke("agent-console:spotlight:open-main");
      setQuery("");
    } finally {
      setPending(false);
    }
  }, [pending]);

  const submitPrompt = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await window.agentConsole?.ipc.invoke("agent-console:spotlight:submit", { prompt: trimmedQuery });
      setQuery("");
    } finally {
      setPending(false);
    }
  }, [pending, trimmedQuery]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void hideSpotlight();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openMain();
      }
    },
    [hideSpotlight, openMain]
  );

  return (
    <main className={`spotlight-page${shown ? " spotlight-page--shown" : ""}`} onKeyDown={onKeyDown}>
      <SpotlightSearch
        inputRef={inputRef}
        onQueryChange={setQuery}
        onSubmit={() => void submitPrompt()}
        pending={pending}
        query={query}
        sourceApp={sourceApp}
      />
    </main>
  );
}

export default App;
