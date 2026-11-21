import { useTranslation } from "react-i18next";
import MapLootList from "./map-loot-list";
import MapDetailSection from "./map-detail-section";
import { useMapLootDisplayRows } from "./use-map-loot-display-rows";
import type { ItemDatabaseEntry } from "../items/types";
import type { MapContainerLootProfile, MapDeathLootProfile } from "./types";

interface MapLootProfileSectionProps {
  deathLoot?: MapDeathLootProfile;
  containerLoot?: MapContainerLootProfile;
  selectedItemId?: string;
  onSelectItem?: (item: ItemDatabaseEntry) => void;
}

const MapLootProfileSection = ({
  deathLoot,
  containerLoot,
  selectedItemId,
  onSelectItem,
}: MapLootProfileSectionProps) => {
  const { t, i18n } = useTranslation();
  const { loading, rawRows, rows } = useMapLootDisplayRows(deathLoot, containerLoot);
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const condition = deathLoot?.availability?.localizedConditions[language]
    ?? deathLoot?.availability?.localizedConditions.en;

  if (rawRows.length === 0 || (!loading && rows.length === 0)) return null;

  return (
    <MapDetailSection id="map-loot-title" title={t("map.containerLoot.title")}>
      {condition && <p className="mb-2.5 text-[12px] leading-relaxed text-subtle">{condition}</p>}
      <MapLootList
        rows={rows}
        loading={loading}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
      />
    </MapDetailSection>
  );
};

export default MapLootProfileSection;
