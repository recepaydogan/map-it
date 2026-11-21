import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapOwnershipProfile } from "./types";

const MapOwnershipProfileSection = ({ profile }: { profile: MapOwnershipProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-ownership-title">
      <div className="map-dialogue-section-heading">
        <ShieldAlert size={14} aria-hidden="true" />
        <h4 id="map-ownership-title">{t("map.ownership.title")}</h4>
      </div>
      <p className="map-dialogue-hint">
        {profile.initiallyOwned
          ? profile.ownerTitle
            ? t("map.ownership.initiallyOwnedBy", { owner: profile.ownerTitle })
            : t("map.ownership.initiallyOwned")
          : profile.ownerTitle
            ? t("map.ownership.ownedBy", { owner: profile.ownerTitle })
            : t("map.ownership.owned")}
        {profile.unauthorizedInteractionRisk
          ? ` ${t(profile.ownershipCanChange
            ? "map.ownership.changeableCrimeWarning"
            : "map.ownership.crimeWarning")}`
          : ""}
      </p>
    </section>
  );
};

export default MapOwnershipProfileSection;
