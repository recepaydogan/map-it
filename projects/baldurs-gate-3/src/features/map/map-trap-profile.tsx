import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapTrapProfile } from "./types";

const MapTrapProfileSection = ({ profile }: { profile: MapTrapProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-trap-profile-title">
      <div className="flex items-center gap-2">
        <TriangleAlert size={13} className="text-orange-300" aria-hidden="true" />
        <h4 id="map-trap-profile-title">{t("map.trap.title")}</h4>
      </div>
      <ul className="map-dialogue-groups">
        <li>
          <span>{t("map.trap.type")}</span>
          <strong>{t(`map.trap.types.${profile.type}`)}</strong>
        </li>
        <li>
          <span>{t("map.trap.disarm")}</span>
          <strong>
            {profile.difficultyClass !== undefined
              ? t("map.trap.dc", { value: profile.difficultyClass })
              : t("map.trap.unknownDc")}
          </strong>
        </li>
      </ul>
    </section>
  );
};

export default MapTrapProfileSection;
