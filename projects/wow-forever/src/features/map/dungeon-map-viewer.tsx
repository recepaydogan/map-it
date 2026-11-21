import { MapPinned } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { dungeonBossTarget } from "../reference/dungeon-boss-target";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { dungeonDisplayName, dungeonFloorId, dungeonFloorLabel, type DungeonMap } from "./dungeon-maps";
import InteractiveMap from "./interactive-map";
import MapDataState from "./map-data-state";
import { getMapDefinition } from "./map-registry";
import { useMapData } from "./use-map-data";

const DungeonMapViewer = ({ map, onOpenMap, className }: { map: DungeonMap; onOpenMap: (mapId: string) => void; className?: string }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const [floorIndex, setFloorIndex] = useState(0);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>();
  const mapId = dungeonFloorId(map.id, floorIndex);
  const { data, error } = useMapData(getMapDefinition(mapId));
  const selectedPoint = data?.locations.find((point) => point.id === selectedMarkerId) ?? null;

  return <section aria-label={t("dungeonJournal.mapFor", { name: dungeonDisplayName(map.name, gameText) })}
    className={cn("flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border", className)}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      {map.floors.length > 1 && <div className="flex min-w-0 flex-wrap gap-1">
        {map.floors.map((floor, index) => <button key={floor.image} type="button" aria-pressed={floorIndex === index}
          onClick={() => {
            setFloorIndex(index);
            setSelectedMarkerId(undefined);
          }}
          className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent",
            floorIndex === index ? "border-accent/50 text-accent" : "border-transparent text-muted hover:text-white")}>
          {dungeonFloorLabel(floor, index, t, gameText)}
        </button>)}
      </div>}
      <button type="button" onClick={() => onOpenMap(mapId)}
        className="ms-auto inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-accent hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
        <MapPinned size={14} aria-hidden="true" />{t("dungeonJournal.openInMap")}
      </button>
    </div>
    <div className="min-h-0 flex-1">
      {data ? <InteractiveMap key={data.id} data={data} points={data.locations} poiLabelPoints={[]}
        completedIds={[]} selectedPoint={selectedPoint} hiddenFlightRouteIds={[]} focusPoint={null}
        placementMode={false} livePosition={{ position: null, status: "disconnected" }} persistView={false}
        onSelectPoint={(point) => {
          if (point && "dungeonPassage" in point && point.dungeonPassage) {
            setFloorIndex(point.dungeonPassage.floor);
            setSelectedMarkerId(point.dungeonPassage.markerId);
            return;
          }
          setSelectedMarkerId(point?.id);
          if (point && "dungeonBoss" in point && point.dungeonBoss) {
            openReference(dungeonBossTarget(point.dungeonBoss.dungeonId, point.dungeonBoss.index, point.sourceName ?? point.name));
          }
        }}
        onQuestGroup={() => {}} onPlaceMarker={() => {}} />
        : <MapDataState error={error} compact />}
    </div>
  </section>;
};

export default DungeonMapViewer;
