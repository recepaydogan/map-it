import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import CategoryDot from "../../components/category-dot";
import type { CategoryDef } from "../../data/types";
import { cn } from "../../lib/cn";

interface CategoryToggleProps {
  def: CategoryDef;
  active: boolean;
  count: number;
  /** How many of `count` are ticked off, when the surface tracks completion and
   *  this category's markers are actually loaded. Undefined = no number to give,
   *  and the row shows the plain total instead of a made-up fraction. */
  done?: number;
  /** Real map-symbol art for this category, when the map uses one. */
  iconUrl?: string;
  onToggle: () => void;
  onOnly: () => void;
}

/**
 * A single category row. The whole row toggles the category; a hover-revealed
 * "Only" isolates it in one click (the fast path when the user wants just one
 * thing instead of unchecking everything else).
 */
const CategoryToggle = ({ def, active, count, done, iconUrl, onToggle, onOnly }: CategoryToggleProps) => {
  const { t, i18n } = useTranslation();
  const num = (value: number) => value.toLocaleString(i18n.language);
  return (
    <div
      className={cn(
        "group/cat flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all",
        active ? "hover:bg-white/5" : "opacity-70 hover:opacity-100 hover:bg-white/5",
      )}
    >
      <button
        onClick={onToggle}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
      >
        <CategoryDot color={def.color} icon={def.icon} size={20} iconUrl={iconUrl} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{def.label}</span>
      </button>
      <button
        onClick={onOnly}
        tabIndex={-1}
        className="hidden rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/cat:block cursor-pointer"
      >
        {t("common.only")}
      </button>
      {count > 0 && (
        <span
          className="text-[11px] tabular-nums text-zinc-400"
          title={done === undefined ? undefined : t("filters.completionTitle", { done, total: count })}
        >
          {done === undefined ? (
            num(count)
          ) : (
            <>
              {/* Green is already this app's "done" (the check badge on a found
                  pin, index.css) — the same colour saying the same thing. */}
              <span className={done > 0 ? "font-semibold text-emerald-300" : undefined}>{num(done)}</span>
              <span className="text-zinc-500">{" / "}</span>
              {num(count)}
            </>
          )}
        </span>
      )}
      <button
        onClick={onToggle}
        aria-pressed={active}
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors cursor-pointer",
          active ? "border-accent bg-accent text-on-accent" : "border-zinc-500 hover:border-zinc-400",
        )}
      >
        {active && <Check size={11} strokeWidth={3} aria-hidden="true" />}
      </button>
    </div>
  );
};

export default CategoryToggle;
