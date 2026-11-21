import { getMapPointDisplayName } from "./map-point-display-name";
import { Bookmark, CheckCheck, MapPin, Route } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapPoint } from "./types";
import { isUserMapMarker } from "./types";

type SavedPanelFilter = "all" | "saved" | "completed";

interface MapSavedPanelProps {
  /** Favourites plus every personal marker on this map. */
  savedPoints: MapPoint[];
  completedPoints: MapPoint[];
  onSelect: (point: MapPoint) => void;
  gatheringRoute: MapPoint[];
  onPlanGatheringRoute: () => void;
  onClearGatheringRoute: () => void;
}

/** The "Saved" tool panel: everything the player kept, one click from the map. */
const MapSavedPanel = ({ savedPoints, completedPoints, onSelect, gatheringRoute,
  onPlanGatheringRoute, onClearGatheringRoute }: MapSavedPanelProps) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SavedPanelFilter>("all");

  const completedIds = new Set(completedPoints.map((point) => point.id));
  const resourceCount = savedPoints.filter((point) => isUserMapMarker(point) && point.group === "resources").length;
  const visiblePoints = filter === "saved"
    ? savedPoints
    : filter === "completed"
      ? completedPoints
      : [...savedPoints, ...completedPoints.filter((point) => !savedPoints.some(({ id }) => id === point.id))];

  const filters: { id: SavedPanelFilter; label: string }[] = [
    { id: "all", label: t("map.saved.filterAll") },
    { id: "saved", label: t("map.saved.filterSaved") },
    { id: "completed", label: t("map.saved.filterCompleted") },
  ];

  return (
    <div className="space-y-2">
      {resourceCount >= 2 && <div className="rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-100">
          <Route size={15} className="text-accent" aria-hidden="true" />{t("map.saved.gatheringTitle")}
        </div>
        <p className="mt-1 text-[10px] leading-4 text-zinc-400">{t("map.saved.gatheringDescription", { count: resourceCount })}</p>
        <button type="button" onClick={gatheringRoute.length ? onClearGatheringRoute : onPlanGatheringRoute}
          className="mt-2 cursor-pointer rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-white hover:border-accent">
          {gatheringRoute.length ? t("map.saved.clearGatheringRoute") : t("map.saved.planGatheringRoute")}
        </button>
        {gatheringRoute.length > 0 && <>
          <p className="mt-2 text-[10px] leading-4 text-zinc-400">{t("map.saved.routeApproximate")}</p>
          <ol className="mt-2 space-y-1">
            {gatheringRoute.map((point, index) => <li key={point.id}>
              <button type="button" onClick={() => onSelect(point)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-white/5">
                <span className="text-accent">{index + 1}.</span>{getMapPointDisplayName(point)}
              </button>
            </li>)}
          </ol>
        </>}
      </div>}
      <div className="flex gap-1" role="toolbar" aria-label={t("map.saved.title")}>
        {filters.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "cursor-pointer rounded-[var(--radius-full)] border px-2.5 py-1 text-[10px] font-semibold transition-colors",
              filter === id
                ? "border-accent/40 bg-accent-soft text-white"
                : "border-border text-zinc-300 hover:bg-white/5 hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visiblePoints.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-white/3 px-4 py-8 text-center">
          <Bookmark size={20} className="mx-auto text-zinc-500" aria-hidden="true" />
          <p className="mt-2 text-[11px] leading-4 text-white/70">{t("map.saved.empty")}</p>
        </div>
      ) : (
        <>
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70">
            {t("map.saved.count", { count: visiblePoints.length })}
          </p>
          <div className="space-y-1.5">
            {visiblePoints.map((point) => (
              <button
                key={point.id}
                type="button"
                onClick={() => onSelect(point)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/35 hover:bg-accent-soft"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/8 text-accent">
                  {completedIds.has(point.id) ? (
                    <CheckCheck size={15} aria-hidden="true" />
                  ) : (
                    <MapPin size={15} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[12px] font-semibold text-zinc-100">{getMapPointDisplayName(point)}</strong>
                  <span className="mt-0.5 block truncate text-[10px] text-zinc-400">
                    {[point.region, `${point.x}, ${point.y}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MapSavedPanel;
