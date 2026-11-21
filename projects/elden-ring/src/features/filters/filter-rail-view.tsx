import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { useIsMobile } from "../../utils/platform";
import FilterRailPanel, { type FilterRailPanelProps } from "./filter-rail-panel";

interface FilterRailViewProps extends Omit<FilterRailPanelProps, "sheet"> {
  open: boolean;
}

/**
 * The frame around the filter rail. Two shapes, one body (filter-rail-panel):
 *
 *  • Desktop / Overwolf — a 19rem panel docked to the left of the map, floating
 *    over it. Unchanged; Overwolf's 1300px window floor means it is the only
 *    shape that build ever renders.
 *  • Phone — a bottom sheet over a scrim. A docked 19rem column is 80% of a
 *    390px screen, so the "panel beside the map" idea doesn't survive the width;
 *    a sheet you pull up, filter with, and dismiss does. It matches the detail
 *    panel, which already becomes a sheet at the same breakpoint.
 *
 * Collapsed, both shapes fall back to the same compact trigger pinned in the
 * map's control column.
 */
const FilterRailView = ({ open, ...panel }: FilterRailViewProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { categories, activeCategories, setOpen } = panel;

  if (!open) {
    // Count against the LISTED categories only — the active set can hold keys the
    // current view doesn't list (a category with pins only on another map layer).
    const activeListed = categories.reduce(
      (n, category) => n + (activeCategories.has(category.key) ? 1 : 0),
      0,
    );
    return (
      <div
        data-tour="filters"
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-[var(--radius-lg)] border border-border bg-surface/85 p-0.5 backdrop-blur-xl sm:p-2"
      >
        <button
          onClick={() => setOpen(true)}
          aria-label={t("filters.open")}
          // 32px on touch (see MapActionButton), 36px from `sm` up — and a
          // near-flush wrapper on a phone, since the padded frame around it was
          // what made this read as the largest control on the map.
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-200 hover:bg-white/5 cursor-pointer sm:h-9 sm:w-9"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeListed > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-on-accent">
              {activeListed}
            </span>
          )}
        </button>
      </div>
    );
  }

  if (isMobile) {
    // Portalled for the same reason the nav drawer is: the map's floating column
    // is a z-1350 stacking context, and a sheet rendered inside it would be
    // clipped by the column's insets instead of reaching the screen edges.
    return createPortal(
      <>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("filters.collapse")}
          className="fixed inset-0 z-[1290] h-full w-full cursor-default bg-black/40 animate-fade-in"
        />
        <div
          data-tour="filters"
          role="dialog"
          aria-modal="true"
          aria-label={t("filters.title")}
          // --sheet-top-gap (index.css) keeps this clear of the map's toolbar row,
          // not just the title bar — shared with the detail panel's sheet.
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1300] flex max-h-[calc(100dvh-var(--sheet-top-gap)-env(safe-area-inset-top))] flex-col overflow-hidden rounded-t-[var(--radius-lg)] border-x border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/50 backdrop-blur-xl animate-slide-up"
        >
          {/* Grab handle — the universal "this sheet came from the bottom" cue. */}
          <div aria-hidden="true" className="flex shrink-0 justify-center pb-1 pt-2">
            <span className="h-1 w-9 rounded-full bg-white/20" />
          </div>
          <FilterRailPanel {...panel} sheet />
        </div>
      </>,
      document.body,
    );
  }

  return (
    <div
      data-tour="filters"
      className="pointer-events-auto flex max-h-[85%] w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in"
    >
      <FilterRailPanel {...panel} />
    </div>
  );
};

export default FilterRailView;
