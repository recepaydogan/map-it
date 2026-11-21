import { Check, Eye, EyeOff, LocateFixed, Pencil, Plus, Route, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MAX_ROUTE_NAME_LENGTH, MAX_SAVED_ROUTES_PER_MAP } from "./map-route-utils";
import MapLootRouteDetails from "./map-loot-route-details";
import MapRouteCreatePanel from "./map-route-create-panel";
import type { MapCoordinate, MapMetadata, SavedLootRun, SavedMapRoute } from "./types";

interface MapRoutesPanelProps {
  routes: SavedMapRoute[];
  detailsRouteId: string | null;
  visibleRouteIds: string[];
  drafting: boolean;
  draftStopCount: number;
  data: MapMetadata;
  lootRuns: SavedLootRun[];
  onStartRoute: (points: Array<MapCoordinate & { label?: string }>) => void;
  onToggleRoute: (routeId: string) => void;
  onRenameRoute: (routeId: string, name: string) => void;
  onRemoveRoute: (routeId: string) => void;
  onFocusRoute: (route: SavedMapRoute) => void;
  onToggleLootRunLocation: (runId: string, locationId: string) => void;
  onDetailsRouteChange: (routeId: string | null) => void;
  onClose: () => void;
}

const MapRoutesPanel = ({
  routes,
  detailsRouteId,
  visibleRouteIds,
  drafting,
  draftStopCount,
  data,
  lootRuns,
  onStartRoute,
  onToggleRoute,
  onRenameRoute,
  onRemoveRoute,
  onFocusRoute,
  onToggleLootRunLocation,
  onDetailsRouteChange,
  onClose,
}: MapRoutesPanelProps) => {
  const { t } = useTranslation();
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeNameDraft, setRouteNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const visibleIds = new Set(visibleRouteIds);
  let manualRouteNumber = 0;
  const routeItems = routes.map((route) => {
    const linkedRun = route.lootRunId
      ? lootRuns.find((run) => run.id === route.lootRunId) ?? null
      : null;
    const fallbackLabel = route.source === "loot-run"
      ? t("map.route.lootRunRoute")
      : t("map.route.named", { number: ++manualRouteNumber });
    const legacyAutomaticName = route.source === "loot-run" && route.name?.includes(" + ");
    const label = legacyAutomaticName && linkedRun
      ? `${t("map.route.lootRunRoute")} · ${t("map.lootRun.itemCount", { count: linkedRun.items.length })}`
      : route.name?.trim() || fallbackLabel;
    return { route, linkedRun, label };
  });
  const maximumReached = routes.length >= MAX_SAVED_ROUTES_PER_MAP;
  const detailsRoute = routes.find((route) => route.id === detailsRouteId) ?? null;
  const detailsRun = detailsRoute?.lootRunId
    ? lootRuns.find((run) => run.id === detailsRoute.lootRunId) ?? null
    : null;
  const detailsRouteLabel = routeItems.find(({ route }) => route.id === detailsRouteId)?.label
    ?? t("map.route.lootRunRoute");
  const showingDetails = Boolean(detailsRoute && detailsRun);

  const cancelRename = () => {
    setEditingRouteId(null);
    setRouteNameDraft("");
  };

  const saveRouteName = (event: FormEvent<HTMLFormElement>, routeId: string) => {
    event.preventDefault();
    const nextName = routeNameDraft.trim();
    if (!nextName) return;
    onRenameRoute(routeId, nextName);
    cancelRename();
  };

  return (
    <section
      aria-label={t("map.route.myRoutes")}
      className="map-routes-panel pointer-events-auto animate-fade-in"
    >
      <header className="map-routes-panel-header">
        <span className="map-routes-panel-mark"><Route size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="map-routes-panel-title">{t("map.route.myRoutes")}</h2>
          <p className="map-routes-panel-subtitle">
            {t("map.route.savedCount", { count: routes.length })}
          </p>
        </div>
        <span className="map-routes-panel-capacity" aria-hidden="true">
          <strong>{routes.length}</strong><span>/</span>{MAX_SAVED_ROUTES_PER_MAP}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.route.closePanel")}
          className="map-routes-panel-close"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {drafting && (
        <div className="map-routes-panel-draft">
          <span className="map-routes-panel-draft-dot" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>{t("map.route.draftInProgress")}</strong>
            <small>
              {t("map.route.draftStops", { count: draftStopCount })}
            </small>
          </span>
        </div>
      )}

      <div className="map-routes-panel-body">
        {detailsRoute && detailsRun ? (
          <MapLootRouteDetails
            data={data}
            route={detailsRoute}
            routeLabel={detailsRouteLabel}
            run={detailsRun}
            onBack={() => onDetailsRouteChange(null)}
            onFocusRoute={onFocusRoute}
            onToggleCompleted={(locationId) => onToggleLootRunLocation(detailsRun.id, locationId)}
          />
        ) : routeItems.length > 0 ? (
          <div className="map-routes-list">
            {routeItems.map(({ route, linkedRun, label }) => {
              const visible = visibleIds.has(route.id);
              const editing = editingRouteId === route.id;
              const VisibilityIcon = visible ? Eye : EyeOff;
              return (
                <div
                  key={route.id}
                  className={cn("map-routes-item", !visible && "map-routes-item-hidden")}
                  data-visible={visible}
                >
                  {editing ? (
                    <form
                      className="map-routes-rename-form"
                      onSubmit={(event) => saveRouteName(event, route.id)}
                      data-map-nested-popover
                    >
                      <span className="map-routes-item-icon" aria-hidden="true"><Route size={15} /></span>
                      <input
                        autoFocus
                        required
                        maxLength={MAX_ROUTE_NAME_LENGTH}
                        value={routeNameDraft}
                        onChange={(event) => setRouteNameDraft(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelRename();
                          }
                        }}
                        aria-label={t("map.route.routeName")}
                        className="map-routes-name-input"
                      />
                      <div className="map-routes-item-actions">
                        <button
                          type="submit"
                          disabled={!routeNameDraft.trim()}
                          aria-label={t("map.route.saveRouteName")}
                          title={t("map.route.saveRouteName")}
                          className="map-routes-confirm"
                        >
                          <Check size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          aria-label={t("map.route.cancelRouteRename")}
                          title={t("map.route.cancelRouteRename")}
                          className="map-routes-cancel-rename"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="map-routes-item-main">
                        <span className="map-routes-item-icon" aria-hidden="true"><Route size={15} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="map-routes-item-name">{label}</span>
                          <span className="map-routes-item-meta">
                            {t("map.route.stops", { count: linkedRun?.locationIds.length ?? route.points.length })}
                            {linkedRun && (
                              <button type="button" onClick={() => onDetailsRouteChange(route.id)}>
                                {t("map.route.seeDetails")}
                              </button>
                            )}
                          </span>
                        </span>
                      </div>
                      <div className="map-routes-item-actions">
                        <button
                          type="button"
                          onClick={() => onFocusRoute(route)}
                          aria-label={t("map.route.focusNamedRoute", { name: label })}
                          title={t("map.route.focusNamedRoute", { name: label })}
                          className="map-routes-focus"
                        >
                          <LocateFixed size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRouteId(route.id);
                            setRouteNameDraft(label);
                          }}
                          aria-label={t("map.route.renameNamedRoute", { name: label })}
                          title={t("map.route.renameRoute")}
                          className="map-routes-rename"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleRoute(route.id)}
                          aria-pressed={visible}
                          aria-label={t(visible ? "map.route.hideNamedRoute" : "map.route.showNamedRoute", { name: label })}
                          title={t(visible ? "map.route.hideNamedRoute" : "map.route.showNamedRoute", { name: label })}
                          className="map-routes-visibility"
                        >
                          <VisibilityIcon size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveRoute(route.id)}
                          aria-label={t("map.route.deleteNamedRoute", { name: label })}
                          title={t("map.route.deleteRoute")}
                          className="map-routes-delete"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="map-routes-empty">
            <span className="map-routes-empty-icon"><Route size={20} aria-hidden="true" /></span>
            <p className="map-routes-empty-title">{t("map.route.emptyTitle")}</p>
            <p className="map-routes-empty-body">
              {t("map.route.emptyBody")}
            </p>
          </div>
        )}
      </div>

      {!showingDetails && <footer className="map-routes-panel-footer">
        {creating ? (
          <MapRouteCreatePanel
            towns={data.towns}
            bounds={data.bounds}
            onStart={onStartRoute}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={drafting || maximumReached}
            title={maximumReached
              ? t("map.route.maximumRoutesReached", { count: MAX_SAVED_ROUTES_PER_MAP })
              : t("map.route.createRoute")}
            className="map-routes-create"
          >
            <span><Plus size={15} aria-hidden="true" /></span>
            {drafting ? t("map.route.drawingRoute") : t("map.route.createRoute")}
          </button>
        )}
      </footer>}
    </section>
  );
};

export default MapRoutesPanel;
