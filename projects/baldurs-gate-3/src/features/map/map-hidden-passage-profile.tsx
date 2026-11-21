import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

const MapHiddenPassageProfileSection = () => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-hidden-passage-title">
      <div className="map-dialogue-section-heading">
        <Eye size={14} aria-hidden="true" />
        <h4 id="map-hidden-passage-title">{t("map.hiddenPassage.title")}</h4>
      </div>
    </section>
  );
};

export default MapHiddenPassageProfileSection;
