import { ArrowUpRight, Map } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMapRegionTargetId } from "../map/map-focus-request";
import { hasMapDefinition } from "../map/map-registry";
import type { ReferenceEntry } from "./reference-types";

const EventAreaLink = ({ target, onOpenMap }: {
  target: NonNullable<ReferenceEntry["eventArea"]>;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  if (!hasMapDefinition(target.mapId)) return null;
  return <button type="button" onClick={() => onOpenMap(target.mapId, getMapRegionTargetId(target.regionId))}
    className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3 text-left text-zinc-200 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent">
    <Map size={18} className="shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t("mapInteriors.openEventArea")}</span><span className="mt-0.5 block text-xs text-subtle">{t(target.nameKey)}</span></span>
    <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
  </button>;
};

export default EventAreaLink;
