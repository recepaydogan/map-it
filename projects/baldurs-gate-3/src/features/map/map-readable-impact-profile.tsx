import { BookOpenCheck, MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapReadableImpactProfile } from "./types";

const MapReadableImpactProfileSection = ({ profile }: { profile: MapReadableImpactProfile }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const localized = (values: Record<string, string>) => values[language] ?? values.en;

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-readable-impact-title">
      <div className="map-dialogue-section-heading">
        <BookOpenCheck size={14} aria-hidden="true" />
        <h4 id="map-readable-impact-title">{t("map.readableImpact.title")}</h4>
      </div>
      {profile.questUpdates.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {profile.questUpdates.map((update) => {
            const questTitle = localized(update.localizedQuestTitles);
            const stateDescription = localized(update.localizedStateDescriptions);
            return (
              <div key={update.id} className="rounded-lg border border-amber-200/10 bg-amber-200/[0.04] px-2.5 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/60">
                  {t("map.readableImpact.questUpdate")}
                </span>
                {questTitle && <strong className="mt-0.5 block text-[11px] text-white">{questTitle}</strong>}
                {stateDescription && (
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/55">{stateDescription}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {profile.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.flags.map((impact) => (
            <span key={impact.id} className="map-dialogue-tag inline-flex items-center gap-1">
              {impact.kind === "map-reveal" && <MapPinned size={10} aria-hidden="true" />}
              {impact.kind === "map-reveal" ? t("map.readableImpact.mapReveal") : impact.title}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export default MapReadableImpactProfileSection;
