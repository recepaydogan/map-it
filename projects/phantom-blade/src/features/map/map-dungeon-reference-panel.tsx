import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ReferenceLocationContext } from "../reference/reference-location-context";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceLocation } from "../reference/reference-types";
import MapLocationDetails from "./map-location-details";
import { getMapDefinition } from "./map-registry";
import { useMapData } from "./use-map-data";
import { useSavedMapState } from "./use-saved-map-state";

const noOp = () => {};
const emptyDestinations = new Set<string>();

const MapDungeonReferencePanel = ({ location, onOpenMap, onClose }: {
  location: ReferenceLocation;
  onOpenMap: (mapId: string, markerId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const sourceLocation = useContext(ReferenceLocationContext);
  const openReference = useReferenceNavigation();
  const { data, loading, error } = useMapData(getMapDefinition(location.mapId));
  const saved = useSavedMapState();
  const point = data?.locations.find((candidate) => candidate.id === location.markerId);
  if (loading || !data) return <p className="p-4 text-sm text-subtle" role={error ? "alert" : "status"}>
    {t(error ? "reference.error" : "reference.loading")}</p>;
  if (!point) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;

  return <ReferenceLocationContext.Provider value={{ mapId: location.mapId, markerId: location.markerId }}>
    <MapLocationDetails
      point={point}
      draftMarker={false}
      note={saved.notes[point.id] ?? ""}
      onCreateMarker={noOp}
      onSaveMarkerEdits={noOp}
      flightRouteDestinationIds={emptyDestinations}
      hiddenFlightRouteIds={[]}
      onToggleFlightRoute={noOp}
      mapId={location.mapId}
      mapName={data.displayName}
      onOpenItem={(itemId) => openReference({ category: "items", id: itemId })}
      onViewDetails={sourceLocation?.mapId === location.mapId && sourceLocation.markerId === location.markerId
        ? onClose : () => onOpenMap(location.mapId, location.markerId)}
      onOpenMap={onOpenMap}
      onOpenMapOverview={(mapId) => onOpenMap(mapId, `map-overview:${mapId}`)}
      favorite={saved.favoriteIds.includes(point.id)}
      completed={saved.completedIds.includes(point.id)}
      onBack={onClose}
      onToggleFavorite={() => saved.toggleFavorite(point.id)}
      onToggleCompleted={() => saved.toggleCompleted(point.id)}
      onRemove={noOp}
      onSaveCoordinate={noOp}
      onUpdateStyle={noOp}
      onUpdateGroup={noOp}
    />
  </ReferenceLocationContext.Provider>;
};

export default MapDungeonReferencePanel;
