import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  createItemDatabaseIndex,
  resolveItemDatabaseEntry,
} from "../items/item-database-match";
import ItemAcquisitionSection from "../items/item-acquisition-section";
import ItemDatabaseFacts from "../items/item-database-facts";
import { useItemDatabase } from "../items/use-item-database";
import MapItemLocationProfileSection from "./map-item-location-profile";
import { requestMapLocationNavigation } from "./map-location-navigation";
import type { MapItemLocationProfile, MapSearchIndexLocation } from "./types";

interface MapItemDatabaseFactsProps {
  objectId?: string;
  templateId?: string;
  statsId?: string;
  title: string;
  mode?: "all" | "facts" | "directions";
  itemLocation?: MapItemLocationProfile;
  itemOwnerLocations?: MapSearchIndexLocation[];
  onSelectOwner?: (location: MapSearchIndexLocation) => void;
  onSelectRelatedItem?: (itemId: string) => void;
}

/**
 * The item database entry behind an item marker. Mounted only for item points,
 * so the large catalog is fetched the first time one of them is opened rather
 * than on every map load.
 */
const MapItemDatabaseFacts = ({
  objectId,
  templateId,
  statsId,
  title,
  mode = "all",
  itemLocation,
  itemOwnerLocations = [],
  onSelectOwner,
  onSelectRelatedItem,
}: MapItemDatabaseFactsProps) => {
  const { t } = useTranslation();
  const { data, loading } = useItemDatabase();
  const index = useMemo(() => createItemDatabaseIndex(data?.items ?? []), [data]);
  const item = useMemo(
    () => resolveItemDatabaseEntry(index, { objectId, templateId, statsId, title }),
    [index, objectId, templateId, statsId, title],
  );

  if (loading) {
    if (mode === "directions") return null;
    return (
      <p className="border-t border-border px-4 py-3 text-[11px] text-muted">{t("items.loading")}</p>
    );
  }
  if (!item) {
    if (mode === "directions" && itemLocation && onSelectOwner) {
      return (
        <MapItemLocationProfileSection
          profile={itemLocation}
          locations={itemOwnerLocations}
          onSelect={onSelectOwner}
        />
      );
    }
    return null;
  }

  if (mode === "directions") {
    const acquisitions = item.acquisitions ?? [];
    const ownerAlreadyListed = Boolean(itemLocation && acquisitions.some((acquisition) => (
      acquisition.sourceId === itemLocation.ownerContentId
    )));

    if (acquisitions.length === 0 && (!itemLocation || ownerAlreadyListed || !onSelectOwner)) return null;

    return (
      <>
        {acquisitions.length > 0 && (
          <div className="space-y-3.5 border-t border-border px-4 pb-4 pt-3.5">
            <ItemAcquisitionSection
              key={item.id}
              acquisitions={acquisitions}
              initialLimit={3}
              onNavigateMapLocation={(target) => requestMapLocationNavigation({ ...target, drill: true })}
            />
          </div>
        )}
        {itemLocation && !ownerAlreadyListed && onSelectOwner && (
          <MapItemLocationProfileSection
            profile={itemLocation}
            locations={itemOwnerLocations}
            onSelect={onSelectOwner}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3.5 border-t border-border px-4 pb-4 pt-3.5">
      <ItemDatabaseFacts
        item={item}
        layout="panel"
        showDescription={false}
        showAcquisition={mode === "all"}
        onSelectRelatedItem={onSelectRelatedItem}
        onNavigateMapLocation={(target) => requestMapLocationNavigation({ ...target, drill: true })}
      />
    </div>
  );
};

export default MapItemDatabaseFacts;
