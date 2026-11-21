import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Minus } from "lucide-react";
import { iconFor } from "../../data/icon-map";
import type { CategoryDef, CategoryGroup } from "../../data/types";
import { cn } from "../../lib/cn";
import CategoryToggle from "./category-toggle";

interface FilterGroupProps {
  group: CategoryGroup;
  /** Expansion is owned by the rail (accordion: at most one group open). */
  open: boolean;
  onToggleOpen: () => void;
  /** Active search query — when set, the group force-opens and filters its rows. */
  query?: string;
  categoryById: Map<string, CategoryDef>;
  categoryCounts: Map<string, number>;
  /** Per-category completion, for surfaces that track it. */
  doneCounts?: Map<string, number>;
  categoryArt: Map<string, string>;
  activeCategories: Set<string>;
  toggleCategory: (key: string) => void;
  setGroup: (groupKey: string, on: boolean) => void;
  showOnly: (keys: string[]) => void;
}

/**
 * One collapsible meta-group. The header carries a tri-state checkbox (toggles
 * the whole group) plus a live marker count, so the user can act on a group
 * without expanding it — and only opens the group they care about.
 */
const FilterGroup = ({
  group,
  open,
  onToggleOpen: toggleOpen,
  query = "",
  categoryById,
  categoryCounts,
  doneCounts,
  categoryArt,
  activeCategories,
  toggleCategory,
  setGroup,
  showOnly,
}: FilterGroupProps) => {
  const { t, i18n } = useTranslation();

  const q = query.trim().toLowerCase();
  // A query that names the GROUP shows the whole group, not zero rows.
  const groupMatch = q !== "" && group.label.toLowerCase().includes(q);
  const visibleKeys = q && !groupMatch
    ? group.categories.filter((k) => categoryById.get(k)?.label.toLowerCase().includes(q))
    : group.categories;
  if (visibleKeys.length === 0) return null;

  const activeInGroup = group.categories.filter((c) => activeCategories.has(c)).length;
  const total = group.categories.length;
  const allOn = activeInGroup === total;
  const noneOn = activeInGroup === 0;
  const markerCount = group.categories.reduce((n, k) => n + (categoryCounts.get(k) ?? 0), 0);
  // The group pill only shows a fraction when EVERY category under it has a
  // number. Summing over a group where half the categories are switched off (so
  // never loaded) would quietly report a total that isn't the group's.
  const groupDone = doneCounts && group.categories.every((k) => doneCounts.has(k))
    ? group.categories.reduce((n, k) => n + (doneCounts.get(k) ?? 0), 0)
    : undefined;
  const expanded = open || !!q;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="group/hdr flex items-center gap-1">
        {/* Tri-state group checkbox: toggles the whole group in one tap. */}
        <button
          onClick={() => setGroup(group.key, !allOn)}
          aria-label={allOn ? t("filters.hideGroup", { group: group.label }) : t("filters.showGroup", { group: group.label })}
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors cursor-pointer",
            allOn
              ? "border-accent bg-accent text-on-accent"
              : noneOn
                ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent bg-accent/30 text-accent",
          )}
        >
          {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          onClick={toggleOpen}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left cursor-pointer"
          aria-expanded={expanded}
        >
          {createElement(iconFor(group.icon), {
            size: 15,
            className: cn("shrink-0 transition-colors", noneOn ? "text-zinc-500" : "text-accent"),
            "aria-hidden": true,
          })}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">
            {group.label}
          </span>
        </button>
        <button
          onClick={() => showOnly(group.categories)}
          tabIndex={-1}
          className="hidden rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/hdr:block cursor-pointer"
        >
          {t("common.only")}
        </button>
        <button
          onClick={toggleOpen}
          aria-expanded={expanded}
          aria-label={group.label}
          className="flex items-center gap-1.5 py-2 cursor-pointer"
        >
          <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
            {groupDone !== undefined && (
              <>
                <span className={groupDone > 0 ? "text-emerald-300" : undefined}>
                  {groupDone.toLocaleString(i18n.language)}
                </span>
                <span className="text-zinc-500">{" / "}</span>
              </>
            )}
            {markerCount.toLocaleString(i18n.language)}
          </span>
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 pb-2 pl-1">
          {visibleKeys.map((key) => {
            const def = categoryById.get(key);
            if (!def) return null;
            return (
              <CategoryToggle
                key={key}
                def={def}
                active={activeCategories.has(key)}
                count={categoryCounts.get(key) ?? 0}
                done={doneCounts?.get(key)}
                iconUrl={categoryArt.get(key)}
                onToggle={() => toggleCategory(key)}
                onOnly={() => showOnly([key])}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilterGroup;
