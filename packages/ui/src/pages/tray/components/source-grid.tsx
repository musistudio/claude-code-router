import {
  SourceTab, useState, useTrayText
} from "../shared";
import { CircleHelp, Layers3 } from "lucide-react";

function SourceTabIcon({ tab }: { tab: SourceTab }) {
  const [failedIconUrl, setFailedIconUrl] = useState("");
  const isAll = !tab.provider;
  const showProviderIcon = Boolean(tab.iconUrl && tab.iconUrl !== failedIconUrl);

  return (
    <span
      aria-hidden="true"
      className="tray-source-icon flex h-4 w-4 shrink-0 items-center justify-center"
      data-icon-kind={isAll ? "all" : showProviderIcon ? "provider" : "fallback"}
    >
      {isAll ? (
        <Layers3 size={11} strokeWidth={2} />
      ) : showProviderIcon ? (
        <img
          alt=""
          className="h-3.5 w-3.5 rounded-[3px] object-contain"
          src={tab.iconUrl}
          onError={() => setFailedIconUrl(tab.iconUrl ?? "")}
        />
      ) : (
        <CircleHelp size={11} strokeWidth={2} />
      )}
    </span>
  );
}

export function SourceGrid({
  selectedProvider,
  tabs,
  onSelect
}: {
  selectedProvider?: string;
  tabs: SourceTab[];
  onSelect: (provider?: string) => void;
}) {
  const t = useTrayText();

  return (
    <div className="mb-2 grid min-w-0 grid-cols-4 gap-1.5">
      {tabs.map((tab) => {
        const active = tab.provider === selectedProvider || (!tab.provider && !selectedProvider);
        return (
          <button
            aria-pressed={active}
            className="tray-source-tab flex min-w-0 items-center justify-center gap-1 px-1.5 py-1.5 text-center text-[10px] font-semibold"
            data-active={active}
            key={tab.id}
            title={tab.provider ?? t(tab.label)}
            type="button"
            onClick={() => onSelect(tab.provider)}
          >
            <SourceTabIcon tab={tab} />
            <span className="min-w-0 truncate">{t(tab.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
