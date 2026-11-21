import { ChevronDown, ChevronRight, ChevronUp, PackageSearch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { groupMapLootItems } from "./map-loot-display-utils";
import type { MapLootProfile as MapLootProfileData } from "./types";

const INITIAL_ITEM_LIMIT = 12;

interface MapLootProfileProps {
  profile: MapLootProfileData;
  compact?: boolean;
}

const MapLootProfile = ({ profile, compact = false }: MapLootProfileProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  if (profile.items.length === 0) return null;

  const groups = groupMapLootItems(profile.items);
  const itemLimit = compact ? 8 : INITIAL_ITEM_LIMIT;
  const visibleItems = expanded ? groups : groups.slice(0, itemLimit);
  const hiddenItemCount = Math.max(0, groups.length - itemLimit);

  return (
    <section className="map-loot-profile" aria-labelledby="map-loot-profile-title">
      <div className="map-loot-profile-heading">
        <span className="map-loot-profile-icon" aria-hidden="true">
          <PackageSearch size={15} strokeWidth={2.2} />
        </span>
        <h3 id="map-loot-profile-title">{t("map.details.possibleLoot")}</h3>
      </div>

      <ul className="map-loot-profile-items">
        {visibleItems.map((item) => {
          const hasVariants = item.variants.length > 1;
          const groupExpanded = expandedGroups.includes(item.key);
          return (
            <li key={item.key} className={cn(hasVariants && "map-loot-profile-group")}>
              {hasVariants ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((current) => current.includes(item.key)
                      ? current.filter((key) => key !== item.key)
                      : [...current, item.key])}
                    aria-expanded={groupExpanded}
                    className="map-loot-profile-group-button"
                  >
                    <span>{t("map.details.lootVariants", { name: item.name, count: item.variants.length })}</span>
                    {groupExpanded
                      ? <ChevronDown size={12} aria-hidden="true" />
                      : <ChevronRight size={12} aria-hidden="true" />}
                  </button>
                  {groupExpanded && (
                    <ul className="map-loot-profile-variants">
                      {item.variants.map((variant) => <li key={variant}>{variant}</li>)}
                    </ul>
                  )}
                </>
              ) : item.name}
            </li>
          );
        })}
      </ul>

      {!expanded && hiddenItemCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="map-loot-expand-button"
        >
          <ChevronDown size={12} aria-hidden="true" />
          {t("map.details.showMoreLoot", { count: hiddenItemCount })}
        </button>
      )}

      {expanded && groups.length > itemLimit && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="map-loot-collapse-button"
        >
          <ChevronUp size={12} aria-hidden="true" />
          {t("map.details.showLessLoot")}
        </button>
      )}
    </section>
  );
};

export default MapLootProfile;
