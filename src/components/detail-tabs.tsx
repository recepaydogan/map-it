import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

interface DetailTabsProps<T extends string> {
  id: string;
  label: string;
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}

const DetailTabs = <T extends string,>({ id, label, tabs, value, onChange, compact = false }: DetailTabsProps<T>) => {
  const { t } = useTranslation();
  return <div role="tablist" aria-label={t(label)}
    className={cn("shrink-0 border-b border-border", compact ? "grid px-3" : "flex overflow-x-auto px-4")}
    style={compact ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}>
    {tabs.map((tab, index) => <button key={tab.key} type="button" role="tab"
      id={`${id}-${tab.key}`} aria-controls={`${id}-panel`} aria-selected={value === tab.key}
      tabIndex={value === tab.key ? 0 : -1} onClick={() => onChange(tab.key)}
      onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        onChange(tabs[next]!.key);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}
      className={cn("cursor-pointer border-b-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent", compact ? "flex min-h-11 min-w-0 items-center justify-center px-1 py-2 text-center text-[11px] leading-tight" : "shrink-0 px-3 py-3 text-[12px]",
        value === tab.key ? "border-accent text-white" : "border-transparent text-muted hover:text-white")}
    >{t(tab.label)}</button>)}
  </div>;
};

export default DetailTabs;
