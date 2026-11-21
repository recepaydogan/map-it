import { Library, Menu, PackageSearch, Route } from "lucide-react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapRoutesPanel from "./map-routes-panel";
import type { MapCoordinate, MapMetadata, SavedLootRun, SavedMapRoute } from "./types";
import { useDismissable } from "./use-dismissable";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  routesOpen: boolean;
  lootPlannerOpen: boolean;
  libraryOpen: boolean;
  libraryAvailable?: boolean;
  usefulObjectsNudgeVisible?: boolean;
  routes: SavedMapRoute[];
  detailsRouteId: string | null;
  lootRuns: SavedLootRun[];
  visibleRouteIds: string[];
  drafting: boolean;
  draftStopCount: number;
  data: MapMetadata;
  onToggleFilters: () => void;
  onToggleRoutes: () => void;
  onToggleLootPlanner: () => void;
  onToggleLibrary: () => void;
  onCloseRoutes: () => void;
  onStartRoute: (points: Array<MapCoordinate & { label?: string }>) => void;
  onToggleRoute: (routeId: string) => void;
  onRenameRoute: (routeId: string, name: string) => void;
  onRemoveRoute: (routeId: string) => void;
  onFocusRoute: (route: SavedMapRoute) => void;
  onToggleLootRunLocation: (runId: string, locationId: string) => void;
  onDetailsRouteChange: (routeId: string | null) => void;
}

const MapPrimaryControls = ({
  filtersOpen,
  routesOpen,
  lootPlannerOpen,
  libraryOpen,
  libraryAvailable = true,
  usefulObjectsNudgeVisible = false,
  routes,
  detailsRouteId,
  lootRuns,
  visibleRouteIds,
  drafting,
  draftStopCount,
  data,
  onToggleFilters,
  onToggleRoutes,
  onToggleLootPlanner,
  onToggleLibrary,
  onCloseRoutes,
  onStartRoute,
  onToggleRoute,
  onRenameRoute,
  onRemoveRoute,
  onFocusRoute,
  onToggleLootRunLocation,
  onDetailsRouteChange,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRoutes = useCallback(() => onCloseRoutes(), [onCloseRoutes]);
  useDismissable(routesOpen, rootRef, closeRoutes, "[data-map-nested-popover]");

  return (
    <div ref={rootRef} className="map-primary-controls shrink-0" data-map-ui>
      <div className="map-primary-control-bar">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-label={usefulObjectsNudgeVisible
            ? `${t("map.sidebar.menu")}. ${t("map.usefulObjectsOnboarding.menuAnnouncement")}`
            : undefined}
          className={cn(
            filtersOpen && "map-primary-control-active",
            usefulObjectsNudgeVisible && "map-primary-control-feature-nudge",
          )}
        >
          <Menu size={16} aria-hidden="true" />
          <span>{t("map.sidebar.menu")}</span>
          {usefulObjectsNudgeVisible && <span className="map-feature-dot" aria-hidden="true" />}
        </button>
        <button
          type="button"
          data-tour="loot-planner"
          onClick={onToggleLootPlanner}
          aria-expanded={lootPlannerOpen}
          className={cn(lootPlannerOpen && "map-primary-control-active")}
        >
          <PackageSearch size={16} aria-hidden="true" />
          <span>{t("map.lootRun.planner")}</span>
        </button>
        <button
          type="button"
          data-tour="my-routes"
          onClick={onToggleRoutes}
          aria-expanded={routesOpen}
          className={cn((routesOpen || drafting) && "map-primary-control-active")}
        >
          <Route size={16} aria-hidden="true" />
          <span>{t("map.route.myRoutes")}</span>
        </button>
        {libraryAvailable && (
          <button
            type="button"
            data-tour="library"
            onClick={onToggleLibrary}
            aria-expanded={libraryOpen}
            aria-controls="map-library-panel"
            className={cn(libraryOpen && "map-primary-control-active")}
          >
            <Library size={16} aria-hidden="true" />
            <span>{t("map.library.mods")}</span>
          </button>
        )}
      </div>

      {routesOpen && (
        <MapRoutesPanel
          routes={routes}
          detailsRouteId={detailsRouteId}
          visibleRouteIds={visibleRouteIds}
          drafting={drafting}
          draftStopCount={draftStopCount}
          data={data}
          lootRuns={lootRuns}
          onStartRoute={onStartRoute}
          onToggleRoute={onToggleRoute}
          onRenameRoute={onRenameRoute}
          onRemoveRoute={onRemoveRoute}
          onFocusRoute={onFocusRoute}
          onToggleLootRunLocation={onToggleLootRunLocation}
          onDetailsRouteChange={onDetailsRouteChange}
          onClose={onCloseRoutes}
        />
      )}
    </div>
  );
};

export default MapPrimaryControls;
