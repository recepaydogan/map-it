import { ChevronDown, ChevronUp, PackageCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocationLiveLoot } from "../live-loot/live-loot-types";

const INITIAL_ITEM_LIMIT = 12;

interface MapLiveLootProps {
  loot: LocationLiveLoot;
}

const MapLiveLoot = ({ loot }: MapLiveLootProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? loot.items : loot.items.slice(0, INITIAL_ITEM_LIMIT);
  const hiddenItemCount = Math.max(0, loot.items.length - INITIAL_ITEM_LIMIT);

  return (
    <section className="map-loot-profile map-live-loot" aria-labelledby="map-live-loot-title">
      <div className="map-loot-profile-heading">
        <span className="map-loot-profile-icon" aria-hidden="true">
          <PackageCheck size={15} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="map-live-loot-title">{t("map.details.liveVerifiedLoot")}</h3>
          <p>{t("map.details.verifiedContainers", { count: loot.containerCount })}</p>
        </div>
        <span className="map-live-loot-badge">{t("map.details.verified")}</span>
      </div>

      {loot.items.length > 0 ? (
        <ul className="map-loot-profile-items">
          {visibleItems.map((item) => (
            <li key={item.id} title={item.name}>
              <span>{item.name}</span>
              {item.count > 1 && <strong>×{item.count}</strong>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="map-live-loot-empty">{t("map.details.verifiedContainersEmpty")}</p>
      )}

      {!expanded && hiddenItemCount > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="map-loot-expand-button">
          <ChevronDown size={12} aria-hidden="true" />
          {t("map.details.showMoreLoot", { count: hiddenItemCount })}
        </button>
      )}

      {expanded && loot.items.length > INITIAL_ITEM_LIMIT && (
        <button type="button" onClick={() => setExpanded(false)} className="map-loot-collapse-button">
          <ChevronUp size={12} aria-hidden="true" />
          {t("map.details.showLessLoot")}
        </button>
      )}
    </section>
  );
};

export default MapLiveLoot;
