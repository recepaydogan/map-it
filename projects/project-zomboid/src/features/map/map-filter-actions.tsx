import { CheckCheck, Eye, EyeOff, Search, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapFilterActionsProps {
  allCategoriesVisible: boolean;
  noCategoriesVisible: boolean;
  hideLooted: boolean;
  hideFavorites: boolean;
  query: string;
  onShowAll: () => void;
  onHideAll: () => void;
  onHideLootedChange: (hidden: boolean) => void;
  onHideFavoritesChange: (hidden: boolean) => void;
  onQueryChange: (query: string) => void;
}

interface FilterActionButtonProps {
  active: boolean;
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}

const FilterActionButton = ({
  active,
  icon: Icon,
  label,
  onClick,
}: FilterActionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border px-2 py-2 text-[11px] font-semibold transition-colors",
      active
        ? "border-accent/60 bg-accent-soft text-zinc-50"
        : "border-border bg-white/4 text-zinc-300 hover:border-zinc-600 hover:bg-white/7 hover:text-white",
    )}
  >
    <Icon size={13} className={cn("shrink-0", active ? "text-accent" : "text-zinc-400")} aria-hidden="true" />
    <span className="truncate">{label}</span>
  </button>
);

const MapFilterActions = ({
  allCategoriesVisible,
  noCategoriesVisible,
  hideLooted,
  hideFavorites,
  query,
  onShowAll,
  onHideAll,
  onHideLootedChange,
  onHideFavoritesChange,
  onQueryChange,
}: MapFilterActionsProps) => {
  const { t } = useTranslation();

  return (
    <div className="mb-2.5 space-y-2.5 border-b border-border/60 pb-3">
      <div className="grid grid-cols-2 gap-2">
        <FilterActionButton
          active={allCategoriesVisible}
          icon={Eye}
          label={t("map.filters.showAll")}
          onClick={onShowAll}
        />
        <FilterActionButton
          active={noCategoriesVisible}
          icon={EyeOff}
          label={t("map.filters.hideAll")}
          onClick={onHideAll}
        />
        <FilterActionButton
          active={hideLooted}
          icon={CheckCheck}
          label={t("map.filters.hideLooted")}
          onClick={() => onHideLootedChange(!hideLooted)}
        />
        <FilterActionButton
          active={hideFavorites}
          icon={Star}
          label={t("map.filters.hideFavorites")}
          onClick={() => onHideFavoritesChange(!hideFavorites)}
        />
      </div>

      <label className="relative block">
        <span className="sr-only">{t("map.filters.searchCategories")}</span>
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("map.filters.searchCategories")}
          className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-background/70 pl-9 pr-3 text-[12px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 hover:border-zinc-600 focus:border-accent"
        />
      </label>
    </div>
  );
};

export default MapFilterActions;
