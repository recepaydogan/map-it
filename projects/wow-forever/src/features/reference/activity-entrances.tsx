import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { useEventCatalog } from "../events/use-event-catalog";
import { getMapDefinition, hasMapDefinition } from "../map/map-registry";
import DatabaseSectionTitle from "../database/database-section-title";

const ActivityEntrances = ({ familyId, faction, onOpenMap }: {
  familyId: string;
  faction?: string;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const catalog = useEventCatalog();
  // Schedule targets can fall back to interior regions when no entrance is known.
  const entrances = catalog.events.find((event) => event.id === familyId)?.mapTargets
    ?.filter((entrance) => hasMapDefinition(entrance.mapId) && !entrance.markerId.startsWith("region:")
      && (!faction || !entrance.faction || entrance.faction === faction)) ?? [];
  if (!entrances.length) return null;

  return <section className="@container">
    <DatabaseSectionTitle>{t("map.categories.eventEntrance")}</DatabaseSectionTitle>
    <ProgressiveList className="grid gap-2 @min-[480px]:grid-cols-2">{entrances.map((entrance) =>
      <button type="button" key={`${entrance.mapId}:${entrance.markerId}`} onClick={() => onOpenMap(entrance.mapId, entrance.markerId)}
        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-xs text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <MapPin size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{entrance.name ?? getMapDefinition(entrance.mapId).name}</span>
      </button>)}</ProgressiveList>
  </section>;
};

export default ActivityEntrances;
