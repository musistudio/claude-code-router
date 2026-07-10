import { Loader2, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import type { SpotlightSourceApp } from "../utils/source-app";

export function SpotlightSearch({
  inputRef,
  onQueryChange,
  onSubmit,
  pending,
  query,
  sourceApp
}: {
  inputRef: RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  query: string;
  sourceApp: SpotlightSourceApp | null;
}) {
  const hasSourceAppIcon = Boolean(sourceApp?.iconDataUrl) && !pending;

  return (
    <section className="spotlight-shell" aria-label="Codex Spotlight">
      <form
        className="spotlight-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className={`spotlight-mark${hasSourceAppIcon ? " spotlight-mark--app" : ""}`} aria-hidden="true">
          {pending ? (
            <Loader2 className="spotlight-spin" size={16} />
          ) : sourceApp?.iconDataUrl ? (
            <img alt="" className="spotlight-source-icon" src={sourceApp.iconDataUrl} />
          ) : (
            <Sparkles size={17} strokeWidth={2.2} />
          )}
        </div>
        <input
          ref={inputRef}
          aria-label="ask agent"
          autoCapitalize="sentences"
          autoComplete="off"
          className="spotlight-input"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ask agent"
          spellCheck={false}
          value={query}
        />
      </form>
    </section>
  );
}
