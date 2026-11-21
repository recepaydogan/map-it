import { createElement, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCheck,
  Eye,
  EyeOff,
  MapPin,
  PanelLeftClose,
  Search,
  SlidersHorizontal,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CategoryDef, CategoryGroup } from "../../data/types";
import { cn } from "../../lib/cn";
import FilterGroup from "./filter-group";

export interface FilterRailPanelProps {
  categories: CategoryDef[];
  groups: CategoryGroup[];
  categoryById: Map<string, CategoryDef>;
  categoryCounts: Map<string, number>;
  /** Per-category completion. Given only by surfaces that track it — its
   *  presence is what turns the rail's counts into "12 / 45". */
  doneCounts?: Map<string, number>;
  categoryArt: Map<string, string>;
  activeCategories: Set<string>;
  shown: number;
  /** Declutter switches. Optional: a surface with no notion of "done" or
   *  "starred" (Nightreign, whose markers are per-run) simply omits them and the
   *  row does not render. */
  hideCompleted?: boolean;
  setHideCompleted?: (on: boolean) => void;
  hideFavorites?: boolean;
  setHideFavorites?: (on: boolean) => void;
  setOpen: (open: boolean) => void;
  toggleCategory: (key: string) => void;
  setGroup: (groupKey: string, on: boolean) => void;
  showOnly: (keys: string[]) => void;
  beforeGroups?: ReactNode;
  /** Bottom-sheet layout: full-bleed rows and a labelled close, instead of the
   *  fixed-width column and the collapse chevron the docked rail uses. */
  sheet?: boolean;
}

/** Which group is expanded — ONE key for the whole rail (accordion), replacing
 *  the old per-group `elden-ring-atlas:filter-group:*` entries. */
const OPEN_GROUP_KEY = "elden-ring-atlas:filter-rail:open-group";

/**
 * One of the two declutter switches, shaped exactly like the Show-all /
 * Hide-all buttons it sits under. Pressed state is the whole button turning
 * accent rather than a checkbox: at half the rail's width there is no room for
 * a label AND a box, and "this button is currently doing something" is the only
 * thing the state has to say.
 */
const DeclutterToggle = ({
  on,
  onToggle,
  icon,
  label,
  sheet,
}: {
  on: boolean;
  onToggle: () => void;
  icon: LucideIcon;
  label: string;
  sheet: boolean;
}) => (
  <button
    onClick={onToggle}
    aria-pressed={on}
    title={label}
    className={cn(
      "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 text-[12px] font-medium transition-colors cursor-pointer",
      sheet ? "min-h-11" : "py-1.5",
      on
        ? "border-accent/60 bg-accent-soft text-accent"
        : "border-border bg-white/5 text-zinc-200 hover:bg-white/10",
    )}
  >
    {createElement(icon, { size: 13, "aria-hidden": true, className: "shrink-0" })}
    <span className="truncate">{label}</span>
  </button>
);

/**
 * The rail's contents: title row, show/hide-all, category search, and the
 * accordion of groups. Identical on every surface — only the frame around it
 * changes (docked panel on desktop, bottom sheet on a phone), which is
 * filter-rail-view's job.
 */
const FilterRailPanel = ({
  categories,
  groups,
  categoryById,
  categoryCounts,
  doneCounts,
  categoryArt,
  activeCategories,
  shown,
  hideCompleted = false,
  setHideCompleted,
  hideFavorites = false,
  setHideFavorites,
  setOpen,
  toggleCategory,
  setGroup,
  showOnly,
  beforeGroups,
  sheet = false,
}: FilterRailPanelProps) => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  // Accordion: opening a group closes whichever was open. The choice survives
  // reloads — with a long rail, re-opening the same group on every visit was
  // the single most repeated interaction.
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => localStorage.getItem(OPEN_GROUP_KEY),
  );
  const toggleGroup = (key: string) => setOpenGroup((current) => {
    const next = current === key ? null : key;
    if (next) localStorage.setItem(OPEN_GROUP_KEY, next);
    else localStorage.removeItem(OPEN_GROUP_KEY);
    return next;
  });
  // Count against the LISTED categories only — the active set can hold keys the
  // current view doesn't list (a category with pins only on another map layer).
  const activeListed = categories.reduce(
    (n, category) => n + (activeCategories.has(category.key) ? 1 : 0),
    0,
  );
  const allActive = activeListed === categories.length;
  const noneActive = activeListed === 0;

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SlidersHorizontal size={16} className="text-accent" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-white">{t("filters.title")}</h2>
        <span
          className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200"
          title={t("filters.countTitle")}
        >
          <MapPin size={11} className="text-accent" aria-hidden="true" />
          {shown.toLocaleString(i18n.language)}
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label={t("filters.collapse")}
          className={cn(
            "grid place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white cursor-pointer",
            // A sheet is dismissed, not collapsed — and a thumb needs the target.
            sheet ? "-mr-1.5 h-10 w-10" : "h-7 w-7",
          )}
        >
          {sheet ? <X size={18} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <button
          onClick={() => showOnly(categories.map((category) => category.key))}
          disabled={allActive}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 px-2 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/5 cursor-pointer",
            sheet ? "min-h-11" : "py-1.5",
          )}
        >
          <Eye size={13} aria-hidden="true" />
          {t("common.showAll")}
        </button>
        <button
          onClick={() => showOnly([])}
          disabled={noneActive}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 px-2 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/5 cursor-pointer",
            sheet ? "min-h-11" : "py-1.5",
          )}
        >
          <EyeOff size={13} aria-hidden="true" />
          {t("common.hideAll")}
        </button>
      </div>

      {(setHideCompleted || setHideFavorites) && (
        // The second half of the Show-all / Hide-all pair: those two act on
        // categories, these two on your own progress. Same row shape, same
        // width, so the four read as one block of bulk switches — and they sit
        // above the search box because they filter everything, and have to stay
        // reachable while a category search narrows the rows below.
        <div className="flex shrink-0 items-center gap-2 px-4 pt-2">
          {setHideCompleted && (
            <DeclutterToggle
              on={hideCompleted}
              onToggle={() => setHideCompleted(!hideCompleted)}
              icon={CheckCheck}
              label={t("filters.hideCompleted")}
              sheet={sheet}
            />
          )}
          {setHideFavorites && (
            <DeclutterToggle
              on={hideFavorites}
              onToggle={() => setHideFavorites(!hideFavorites)}
              icon={Star}
              label={t("filters.hideFavorites")}
              sheet={sheet}
            />
          )}
        </div>
      )}

      <div className="shrink-0 px-4 pb-2 pt-2">
        <div className={cn(
          "flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 transition-colors focus-within:border-accent",
          sheet ? "min-h-11" : "py-1.5",
        )}>
          <Search size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("filters.findCategory")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label={t("common.clearSearch")}
              className="grid h-4 w-4 place-items-center rounded-full text-zinc-400 hover:text-white cursor-pointer"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-1">
        {/* The `calc(100vw - 100%)` page trick, panel edition: rows are pinned
            to the rail's no-scrollbar content width — 19rem panel − 2px borders
            − 2rem px-4 — instead of the container's %, which shrinks when the
            bar appears. The 8px bar (--scrollbar-size) rides inside the right
            padding: nothing shifts and no gutter is reserved. Coupled to the
            w-[19rem]/border/px-4 in filter-rail-view. The sheet is fluid-width
            and scrolls under an overlay bar, so it takes the full row instead. */}
        <div className={sheet ? "w-full" : "w-[calc(17rem_-_2px)]"}>
          {!query && beforeGroups}
          {groups.map((group) => (
            <FilterGroup
              key={group.key}
              group={group}
              open={openGroup === group.key}
              onToggleOpen={() => toggleGroup(group.key)}
              query={query}
              categoryById={categoryById}
              categoryCounts={categoryCounts}
              doneCounts={doneCounts}
              categoryArt={categoryArt}
              activeCategories={activeCategories}
              toggleCategory={toggleCategory}
              setGroup={setGroup}
              showOnly={showOnly}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default FilterRailPanel;
