import { CheckCheck, Eye, EyeOff, Search, Star, X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export type MapPointStatusFilter = "completed" | "favorite";

interface MapFilterQuickControlsProps {
  query: string;
  hiddenStatuses: MapPointStatusFilter[];
  allCategoriesVisible: boolean;
  noCategoriesVisible: boolean;
  onQueryChange: (query: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onToggleStatus: (status: MapPointStatusFilter) => void;
}

const MapFilterQuickControls = ({
  query,
  hiddenStatuses,
  allCategoriesVisible,
  noCategoriesVisible,
  onQueryChange,
  onShowAll,
  onHideAll,
  onToggleStatus,
}: MapFilterQuickControlsProps) => {
  const { t } = useTranslation();
  const searchId = useId();
  const completedHidden = hiddenStatuses.includes("completed");
  const favoritesHidden = hiddenStatuses.includes("favorite");

  const actions = [
    {
      id: "show-all",
      label: t("map.filters.showAll"),
      icon: Eye,
      active: allCategoriesVisible,
      onClick: onShowAll,
    },
    {
      id: "hide-all",
      label: t("map.filters.hideAll"),
      icon: EyeOff,
      active: noCategoriesVisible,
      onClick: onHideAll,
    },
    {
      id: "completed",
      label: t(completedHidden ? "map.filters.showCompleted" : "map.filters.hideCompleted"),
      icon: CheckCheck,
      active: completedHidden,
      onClick: () => onToggleStatus("completed"),
    },
    {
      id: "favorite",
      label: t(favoritesHidden ? "map.filters.showFavorites" : "map.filters.hideFavorites"),
      icon: Star,
      active: favoritesHidden,
      onClick: () => onToggleStatus("favorite"),
    },
  ];

  return (
    <div className="mb-2.5 space-y-2.5 border-b border-border/60 pb-3">
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map(({ id, label, icon: Icon, active, onClick }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
              "flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/4 px-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-accent/30 hover:bg-white/7 hover:text-white",
              active && "border-accent/35 bg-accent-soft text-accent",
            )}
          >
            <Icon size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">{t("map.filters.searchLabel")}</label>
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("map.filters.searchPlaceholder")}
          autoComplete="off"
          className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-black/20 pl-9 pr-9 text-[12px] text-white outline-none transition-colors placeholder:text-zinc-400 hover:border-white/15 focus:border-accent/45 focus:ring-2 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t("map.filters.clearSearch")}
            title={t("map.filters.clearSearch")}
            className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 transition-colors hover:bg-white/7 hover:text-white"
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MapFilterQuickControls;
