import { useTranslation } from "react-i18next";
import { Check, Star, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * The cross-cutting "tracking" filters that sit above the category groups. Found
 * and favorited markers are always drawn on the map regardless of category; these
 * two switches are how the user filters them back out (turn one off → that whole
 * set disappears). ER-only — Nightreign markers are per-run, not collectibles.
 *
 * Styled to read like a category row (icon · label · Only · count · checkbox) so
 * the rail stays one visual language, with a heading noting the set is always shown.
 */
const TrackingFilters = () => {
  const { t } = useTranslation();
  const {
    game,
    showFound,
    showBookmarks,
    setShowFound,
    setShowBookmarks,
    showOnly,
    trackedCounts,
  } = useMapExperience();

  if (game !== "elden-ring") return null;

  // "Only" isolates one tracked set: clear every category AND the other set, so the
  // map shows just these pins — the fast path to "show me only my found / favorites".
  const onlyFound = () => {
    showOnly([]);
    setShowFound(true);
    setShowBookmarks(false);
  };
  const onlyFavorites = () => {
    showOnly([]);
    setShowBookmarks(true);
    setShowFound(false);
  };

  return (
    <div className="mb-1 border-b border-border/60 pb-2">
      <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {t("filters.trackingHeading")}
      </p>
      <TrackingRow
        icon={Check}
        tint="#34d399"
        label={t("filters.found")}
        count={trackedCounts.found}
        active={showFound}
        onToggle={() => setShowFound(!showFound)}
        onOnly={onlyFound}
      />
      <TrackingRow
        icon={Star}
        tint="#fbbf24"
        label={t("filters.favorites")}
        count={trackedCounts.favorites}
        active={showBookmarks}
        filled
        onToggle={() => setShowBookmarks(!showBookmarks)}
        onOnly={onlyFavorites}
      />
    </div>
  );
};

const TrackingRow = ({
  icon: Icon,
  tint,
  label,
  count,
  active,
  filled,
  onToggle,
  onOnly,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  count: number;
  active: boolean;
  filled?: boolean;
  onToggle: () => void;
  onOnly: () => void;
}) => {
  const { t, i18n } = useTranslation();
  return (
    <div
      className={cn(
        "group/trk flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all",
        active ? "hover:bg-white/5" : "opacity-55 hover:opacity-100 hover:bg-white/5",
      )}
    >
      <button
        onClick={onToggle}
        aria-pressed={active}
        title={active ? t("filters.hideOnMap", { label }) : t("filters.showOnMap", { label })}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
      >
        {/* Inline style: the row tint is a runtime prop (a dynamic hex per row), so
            it cannot be a static Tailwind class. */}
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `${tint}26`, color: tint }}
        >
          <Icon size={12} strokeWidth={2.5} fill={filled ? "currentColor" : "none"} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{label}</span>
      </button>
      <button
        onClick={onOnly}
        tabIndex={-1}
        title={t("filters.showOnly", { label })}
        className="hidden rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/trk:block cursor-pointer"
      >
        {t("common.only")}
      </button>
      {count > 0 && (
        <span className="text-[11px] tabular-nums text-zinc-400 group-hover/trk:hidden">
          {count.toLocaleString(i18n.language)}
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

export default TrackingFilters;
