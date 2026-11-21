import { PackageSearch, Shovel } from "lucide-react";
import { useTranslation } from "react-i18next";
import MapLootList from "./map-loot-list";
import type { ItemDatabaseEntry } from "../items/types";
import type { MapDiggableSecretProfile } from "./types";
import { useMapLootDisplayRows } from "./use-map-loot-display-rows";

interface MapDiggableSecretProfileSectionProps {
  profile: MapDiggableSecretProfile;
  selectedItemId?: string;
  onSelectItem?: (item: ItemDatabaseEntry) => void;
}

const MapDiggableSecretProfileSection = ({
  profile,
  selectedItemId,
  onSelectItem,
}: MapDiggableSecretProfileSectionProps) => {
  const { t } = useTranslation();
  const buriedLoot = useMapLootDisplayRows(undefined, profile.buriedChest?.loot);

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-diggable-secret-title">
      <div className="map-dialogue-section-heading">
        <Shovel size={14} aria-hidden="true" />
        <h4 id="map-diggable-secret-title">{t("map.diggableSecret.title")}</h4>
      </div>
      {profile.revealedByMap && <p className="map-dialogue-hint">{t("map.diggableSecret.mapHint")}</p>}
      {profile.buriedChest && (buriedLoot.loading || buriedLoot.rows.length > 0) && (
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="map-dialogue-section-heading">
            <PackageSearch size={14} aria-hidden="true" />
            <h5>{t("map.diggableSecret.chestTitle")}</h5>
          </div>
          <p className="map-dialogue-hint">{t("map.diggableSecret.chestHint", { title: profile.buriedChest.title })}</p>
          <MapLootList
            rows={buriedLoot.rows}
            loading={buriedLoot.loading}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
          />
        </div>
      )}
    </section>
  );
};

export default MapDiggableSecretProfileSection;
