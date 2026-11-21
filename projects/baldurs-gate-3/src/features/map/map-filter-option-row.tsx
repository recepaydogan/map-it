import { Check, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapFilterOptionRowProps {
  label: string;
  count: number;
  active: boolean;
  icon: LucideIcon;
  onToggle: () => void;
}

/** Shared flat option row used by every non-category map filter. */
const MapFilterOptionRow = ({
  label,
  count,
  active,
  icon: Icon,
  onToggle,
}: MapFilterOptionRowProps) => {
  const { i18n } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "group/filter-row flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-white/5",
        !active && "text-muted",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
          active
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-border bg-white/5 text-zinc-400",
        )}
      >
        <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", active ? "text-zinc-100" : "text-zinc-300")}>
        {label}
      </span>
      <span className="text-[12px] tabular-nums text-zinc-400">
        {count.toLocaleString(i18n.language)}
      </span>
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors",
          active
            ? "border-accent bg-accent text-on-accent"
            : "border-zinc-500 group-hover/filter-row:border-zinc-400",
        )}
        aria-hidden="true"
      >
        {active && <Check size={11} strokeWidth={3} />}
      </span>
    </button>
  );
};

export default MapFilterOptionRow;
