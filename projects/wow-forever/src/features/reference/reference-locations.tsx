import ProgressiveList from "../../components/progressive-list";
import { MapPin } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLocationContext } from "./reference-location-context";
import { useGroupedReferenceLocations } from "./use-grouped-reference-locations";
import { hasMapDefinition } from "../map/map-registry";
import type { ReferenceLocation } from "./reference-types";

const ReferenceLocations = ({ locations, onOpenMap }: { locations: ReferenceLocation[]; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t } = useTranslation();
  const current = useContext(ReferenceLocationContext);
  const visible = useGroupedReferenceLocations(locations.filter((location) => hasMapDefinition(location.mapId)
    && (location.mapId !== current?.mapId || location.markerId !== current.markerId)));
  if (!visible.length) return null;
  return <section className="@container"><DatabaseSectionTitle>{t("reference.locations")}</DatabaseSectionTitle>
    <ProgressiveList className="grid gap-2 @min-[480px]:grid-cols-2">{visible.map((location) => <button type="button" key={`${location.mapId}-${location.markerId}`} onClick={() => onOpenMap(location.mapId, location.markerId)} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-xs text-accent hover:bg-accent-soft"><MapPin size={14} className="shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{location.name}</span></button>)}</ProgressiveList>
  </section>;
};
export default ReferenceLocations;
