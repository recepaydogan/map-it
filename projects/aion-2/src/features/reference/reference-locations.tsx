import ProgressiveList from "../../components/progressive-list";
import { MapPin } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { localizeMapName } from "../map/map-registry";
import type { MapReferenceSearch } from "../map/map-focus-request";
import DatabaseSectionTitle from "../database/database-section-title";
import { cn } from "../../lib/cn";
import { navigableReferenceLocations, ReferenceLocationContext } from "./reference-location-context";
import { useGroupedReferenceLocations } from "./use-grouped-reference-locations";
import type { ReferenceLocation } from "./reference-types";
import MapDestinationLink from "./map-destination-link";

const ReferenceLocations = ({ locations, onOpenMap, embedded = false, creature, groupQuestEnemies = false, iconPath }: {
  locations: ReferenceLocation[];
  onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
  embedded?: boolean;
  creature?: { id: string; name: string };
  groupQuestEnemies?: boolean;
  iconPath?: string;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const current = useContext(ReferenceLocationContext);
  const groups = useGroupedReferenceLocations(navigableReferenceLocations(locations, current), creature?.name, groupQuestEnemies);
  if (!groups.length) return null;
  const links = <ProgressiveList className={cn("grid gap-2", !embedded && "sm:grid-cols-2")}>{groups.map(({ location, region, search }) => {
    const parts = (creature ? region : location.name).split(" · ").map((part) => localizeMapName(part, gameText));
    const onClick = () => onOpenMap(location.mapId, location.markerId, search ?? (creature ? { referenceId: creature.id, name: creature.name, region } : undefined));
    return embedded ? <MapDestinationLink key={`${location.mapId}-${location.markerId}`} icon={MapPin} iconPath={iconPath}
      title={parts.at(-1)} subtitle={parts.length > 1 ? parts.slice(0, -1).join(" · ") : undefined} onClick={onClick} />
      : <button type="button" key={`${location.mapId}-${location.markerId}`} onClick={onClick} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-xs text-accent hover:bg-accent-soft"><MapPin size={14} className="shrink-0" aria-hidden="true" />{parts.join(" · ")}</button>;
  })}</ProgressiveList>;
  if (embedded) return links;
  return <section><DatabaseSectionTitle>{t("reference.locations")}</DatabaseSectionTitle>{links}</section>;
};
export default ReferenceLocations;
