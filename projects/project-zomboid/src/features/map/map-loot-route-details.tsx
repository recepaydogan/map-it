import { ArrowLeft, Check, LocateFixed, MapPinned, PackageSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getLootRunItemWeightAtLocation } from "./loot-run-planner/loot-run-utils";
import type { MapMetadata, SavedLootRun, SavedMapRoute } from "./types";

interface MapLootRouteDetailsProps {
  data: MapMetadata;
  route: SavedMapRoute;
  routeLabel: string;
  run: SavedLootRun;
  onBack: () => void;
  onFocusRoute: (route: SavedMapRoute) => void;
  onToggleCompleted: (locationId: string) => void;
}

const MapLootRouteDetails = ({
  data,
  route,
  routeLabel,
  run,
  onBack,
  onFocusRoute,
  onToggleCompleted,
}: MapLootRouteDetailsProps) => {
  const { t } = useTranslation();
  const stops = run.locationIds.flatMap((locationId) => {
    const location = data.locations.find((candidate) => candidate.id === locationId);
    return location ? [location] : [];
  });

  return (
    <div className="scroll-slim max-h-[min(58vh,440px)] space-y-3 overflow-y-auto pr-1">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("map.route.backToRoutes")}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[12px] font-semibold text-white">
            {routeLabel}
          </strong>
          <small className="mt-0.5 block text-[9px] text-white/70">
            {t("map.lootRun.itemCount", { count: run.items.length })}
            {" · "}
            {t("map.route.stops", { count: stops.length })}
          </small>
        </span>
        <button
          type="button"
          onClick={() => onFocusRoute(route)}
          aria-label={t("map.route.focusNamedRoute", { name: routeLabel })}
          title={t("map.route.focusNamedRoute", { name: routeLabel })}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-border bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LocateFixed size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {run.items.map((item) => (
          <span
            key={item.id}
            className="flex max-w-full items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-white/5 px-2 py-1 text-[9px] font-medium text-white/90"
          >
            <PackageSearch size={10} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">{item.name}</span>
          </span>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-white/3 px-2.5 py-2 text-[9px] leading-4 text-white/75">
        <MapPinned size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="space-y-1">
          <span className="block">{t("map.lootRun.townScopeNotice")}</span>
          <span className="block">{t("map.lootRun.routeOptimizationNotice")}</span>
        </span>
      </div>

      <div className="space-y-2">
        {stops.map((stop, index) => {
          const completed = run.completedLocationIds.includes(stop.id);
          return (
            <article
              key={stop.id}
              className={cn(
                "rounded-[var(--radius-md)] border border-border bg-white/3 p-2.5",
                completed && "opacity-70",
              )}
            >
              <header className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleCompleted(stop.id)}
                  aria-label={completed
                    ? t("map.lootRun.markIncomplete", { location: stop.name })
                    : t("map.lootRun.markComplete", { location: stop.name })}
                  aria-pressed={completed}
                  className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] border text-[10px] font-semibold",
                  completed
                    ? "border-accent bg-accent text-on-accent"
                    : "cursor-pointer border-border bg-black/20 text-white/80 transition-colors hover:border-accent/60 hover:text-white",
                )}>
                  {completed ? <Check size={12} aria-hidden="true" /> : index + 1}
                </button>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[11px] font-semibold text-white">{stop.name}</strong>
                  <small className="mt-0.5 block truncate text-[9px] text-white/70">{stop.town}</small>
                </span>
              </header>

              <div className="mt-2 divide-y divide-white/5 border-t border-border">
                {run.items.map((item) => {
                  const chance = Math.round(getLootRunItemWeightAtLocation(data, stop, item.id));
                  return (
                    <div key={item.id} className="flex items-center gap-2 py-1.5 text-[9px]">
                      <span className="min-w-0 flex-1 truncate text-white/80">{item.name}</span>
                      <strong
                        className="shrink-0 tabular-nums text-white"
                        title={t("map.lootRun.relativeChance", { score: chance })}
                      >
                        {chance}%
                      </strong>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default MapLootRouteDetails;
