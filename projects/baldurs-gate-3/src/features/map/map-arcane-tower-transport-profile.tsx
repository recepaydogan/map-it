import { ArrowRight, Power, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapArcaneTowerTransportProfile } from "./types";

const MapArcaneTowerTransportProfileSection = ({ profile }: { profile: MapArcaneTowerTransportProfile }) => {
  const { t } = useTranslation();
  const currentRoute = profile.role === "button"
    ? profile.routes.find(({ buttonContentId }) => buttonContentId === profile.currentButtonId)
    : null;

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-arcane-transport-title">
      <div className="map-dialogue-section-heading">
        {profile.role === "generator" ? <Power size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
        <h4 id="map-arcane-transport-title">{profile.title}</h4>
      </div>
      <p className="map-dialogue-hint">{t("map.arcaneTowerTransport.powerHint", {
        ingredient: profile.powerIngredient,
        dc: profile.blockedArcanaDc,
      })}</p>
      {currentRoute && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-cyan-200/20 bg-cyan-200/[0.05] px-3 py-2">
          <strong className="flex items-center gap-2 text-[12px] text-cyan-100">
            {t("map.arcaneTowerTransport.floor", { floor: currentRoute.atFloor })}
            <ArrowRight size={12} aria-hidden="true" />
            {t("map.arcaneTowerTransport.floor", { floor: currentRoute.toFloor })}
          </strong>
          {currentRoute.hidden && <p className="map-dialogue-hint">{t("map.arcaneTowerTransport.hiddenButton", { ring: profile.secretRing.title })}</p>}
        </div>
      )}
      {profile.role === "destination" && (
        <p className="map-dialogue-hint">{t("map.arcaneTowerTransport.destination", { floor: profile.currentFloor })}</p>
      )}
      {profile.role === "secret-ring" && (
        <p className="map-dialogue-hint">{t("map.arcaneTowerTransport.ringHint")}</p>
      )}
      {profile.role === "generator" && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[-1, 0, 1, 2, 3, 4].map((floor) => (
            <span key={floor} className="map-dialogue-tag justify-center">{t("map.arcaneTowerTransport.floor", { floor })}</span>
          ))}
        </div>
      )}
    </section>
  );
};

export default MapArcaneTowerTransportProfileSection;
