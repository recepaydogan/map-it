import { getMapRouteColor } from "./map-route-utils";
import MapRouteLayer from "./map-route-layer";
import type { MapMetadata, MapRouteWaypoint, MapView, SavedMapRoute } from "./types";
import type { MapProjectionMode } from "./map-projection";

interface MapRoutesLayerProps {
  data: MapMetadata;
  routes: SavedMapRoute[];
  draftPoints: MapRouteWaypoint[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  active: boolean;
  hideCard: boolean;
  onUndo: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const MapRoutesLayer = ({
  data,
  routes,
  draftPoints,
  view,
  width,
  height,
  projection,
  active,
  hideCard,
  onUndo,
  onCancel,
  onSave,
}: MapRoutesLayerProps) => {
  return (
    <>
      {routes.map((route) => {
        const lootRoute = route.source === "loot-run" || Boolean(route.lootRunId);
        return (
          <MapRouteLayer
            key={route.id}
            data={data}
            points={route.points}
            view={view}
            width={width}
            height={height}
            projection={projection}
            active={false}
            hideCard
            showStops={lootRoute}
            resilient={lootRoute}
            color={getMapRouteColor(route.id)}
            onUndo={onUndo}
            onCancel={onCancel}
            onSave={onSave}
          />
        );
      })}
      {active && (
        <MapRouteLayer
          key="draft-route"
          data={data}
          points={draftPoints}
          view={view}
          width={width}
          height={height}
          projection={projection}
          active
          hideCard={hideCard}
          showStops
          resilient={false}
          color="var(--gold-bright)"
          onUndo={onUndo}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </>
  );
};

export default MapRoutesLayer;
