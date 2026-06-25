import {
  SourceTab, useTrayText
} from "../shared";
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
            className={[
              "min-w-0 truncate rounded-md border px-2 py-1 text-center text-[10px] font-semibold",
              active
                ? "border-teal-300/35 bg-teal-300/16 text-teal-50"
                : "border-white/10 bg-white/[.04] text-slate-300 hover:border-white/16 hover:bg-white/[.07] hover:text-slate-50"
            ].join(" ")}
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.provider)}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
