import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapStoryOwnershipZoneProfile } from "./types";

const MapStoryOwnershipZoneProfileSection = ({ profile }: { profile: MapStoryOwnershipZoneProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-story-ownership-zone-title">
      <div className="map-dialogue-section-heading">
        <ShieldAlert size={14} aria-hidden="true" />
        <h4 id="map-story-ownership-zone-title">{t("map.storyOwnershipZone.title")}</h4>
      </div>
      <div className="mt-2 space-y-1.5">
        {profile.owners.map((owner) => (
          <div key={owner.contentId} className="rounded-lg border border-rose-200/10 bg-rose-200/[0.04] px-2.5 py-2">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-100/60">
              {t(owner.shopOwner ? "map.storyOwnershipZone.shopOwner" : owner.fallback
                ? "map.storyOwnershipZone.fallbackOwner"
                : "map.storyOwnershipZone.owner")}
            </span>
            <strong className="mt-0.5 block text-[11px] text-white">{owner.title}</strong>
            {owner.conditional && (
              <p className="mt-1 text-[10px] leading-relaxed text-white/55">{t("map.storyOwnershipZone.conditional")}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default MapStoryOwnershipZoneProfileSection;
