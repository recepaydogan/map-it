import { Map, ArrowUpRight } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { getMapRegionTargetId } from "../map/map-focus-request";
import { hasMapDefinition } from "../map/map-registry";
import { ReferenceLocationContext } from "./reference-location-context";
import type { ReferenceEntry } from "./reference-types";

const DungeonInteriorLinks = ({ targets, onOpenMap, labelKey = "mapInteriors.openInterior" }: {
  targets: NonNullable<ReferenceEntry["interiorMaps"]>;
  onOpenMap: (mapId: string, markerId: string) => void;
  labelKey?: string;
}) => {
  const { t } = useTranslation();
  const current = useContext(ReferenceLocationContext);
  // The same interior image can be published beside more than one world map.
  const available = targets.filter((candidate) => hasMapDefinition(candidate.mapId));
  const target = available.find((candidate) => candidate.mapId === current?.mapId) ?? available[0];
  if (!target) return null;
  return <button type="button" onClick={() => onOpenMap(target.mapId,
    target.insetId ? getMapRegionTargetId(target.insetId) : `map-overview:${target.mapId}`)}
    className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-accent bg-accent px-3 py-3 text-left text-on-accent shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    <Map size={18} className="shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1 text-sm font-semibold">{t(labelKey)}</span>
    <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
  </button>;
};

export default DungeonInteriorLinks;
