import { useTranslation } from "react-i18next";
import type { MapItemLocationProfile, MapSearchIndexLocation } from "./types";

interface MapItemLocationProfileProps {
  profile: MapItemLocationProfile;
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

/** A sentinel the owner name is interpolated as, so the link can be placed
 * inside any translated sentence without per-language markup. */
const OWNER_SLOT = "\u0000";

const MapItemLocationProfileSection = ({ profile, locations, onSelect }: MapItemLocationProfileProps) => {
  const { t } = useTranslation();
  const ownerLocation = locations.find(({ contentId }) => contentId === profile.ownerContentId);
  const methods = [
    profile.pickpocketable ? t("map.itemLocation.pickpocket") : "",
    profile.droppedOnDeath ? t("map.itemLocation.deathDrop") : "",
    profile.tradeable ? t("map.itemLocation.trade") : "",
  ].filter(Boolean);
  const sentence = t(profile.ownerKind === "character" ? "map.itemLocation.carriedBy" : "map.itemLocation.inside", {
    owner: OWNER_SLOT,
  });
  const [beforeOwner, afterOwner = ""] = sentence.split(OWNER_SLOT);
  const goToOwner = () => {
    if (ownerLocation) onSelect(ownerLocation);
  };

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-item-location-title">
      <h4 id="map-item-location-title">{t("map.itemLocation.title")}</h4>
      <p className="map-dialogue-hint">
        {beforeOwner}
        {ownerLocation ? (
          <button type="button" onClick={goToOwner} className="map-dialogue-inline-link">
            {ownerLocation.name || profile.ownerTitle}
          </button>
        ) : (
          <strong className="font-semibold text-white/85">{profile.ownerTitle}</strong>
        )}
        {afterOwner}
      </p>
      {methods.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {methods.map((method) => (ownerLocation ? (
            <button
              key={method}
              type="button"
              onClick={goToOwner}
              className="map-dialogue-tag"
              title={t("map.itemLocation.goToOwner", { owner: ownerLocation.name || profile.ownerTitle })}
            >
              {method}
            </button>
          ) : (
            <span key={method} className="map-dialogue-tag">{method}</span>
          )))}
        </div>
      )}
    </section>
  );
};

export default MapItemLocationProfileSection;
