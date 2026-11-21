import { Map } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { getMapRegionTargetId } from "../map/map-focus-request";
import { ReferenceLocationContext } from "./reference-location-context";
import type { ReferenceEntry } from "./reference-types";
import MapDestinationLink from "./map-destination-link";

const DungeonInteriorLinks = ({ targets, onOpenMap, labelKey = "mapInteriors.openInterior" }: {
  targets: NonNullable<ReferenceEntry["interiorMaps"]>;
  onOpenMap: (mapId: string, markerId: string) => void;
  labelKey?: string;
}) => {
  const { t } = useTranslation();
  const current = useContext(ReferenceLocationContext);
  // The same interior image can be published beside more than one world map.
  const target = targets.find((candidate) => candidate.mapId === current?.mapId) ?? targets[0];
  if (!target) return null;
  return <MapDestinationLink icon={Map} title={t(labelKey)}
    onClick={() => onOpenMap(target.mapId, getMapRegionTargetId(target.insetId))} />;
};

export default DungeonInteriorLinks;
