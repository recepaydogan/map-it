import { Handshake, PackageCheck, Skull } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapItemStoryImpactProfile } from "./types";

const MapItemStoryImpactProfileSection = ({ profile }: { profile: MapItemStoryImpactProfile }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const localized = (values: Record<string, string>) => values[language] ?? values.en;

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-item-story-impact-title">
      <div className="map-dialogue-section-heading">
        <PackageCheck size={14} aria-hidden="true" />
        <h4 id="map-item-story-impact-title">{t("map.itemStoryImpact.title")}</h4>
      </div>
      {profile.acquisition?.kind === "head-removal" && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200/10 bg-rose-200/[0.04] px-2.5 py-2">
          <Skull size={12} className="mt-0.5 shrink-0 text-rose-100/70" aria-hidden="true" />
          <div>
            <strong className="block text-[10px] text-white/75">
              {t("map.itemStoryImpact.acquisitionSource", { source: profile.acquisition.sourceTitle })}
            </strong>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/55">
              {t("map.itemStoryImpact.headRemovalHint")}
            </p>
          </div>
        </div>
      )}

      {profile.questUpdates.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {profile.questUpdates.map((update) => {
            const questTitle = localized(update.localizedQuestTitles);
            const stateDescription = localized(update.localizedStateDescriptions);
            return (
              <div key={update.id} className="rounded-lg border border-amber-200/10 bg-amber-200/[0.04] px-2.5 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/60">
                  {t(update.trigger === "hand-in" ? "map.itemStoryImpact.questHandIn" : "map.itemStoryImpact.questCarry")}
                  {update.conditional ? ` · ${t("map.itemStoryImpact.conditional")}` : ""}
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

      {profile.carrying.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] leading-relaxed text-white/55">{t("map.itemStoryImpact.carryingHint")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.carrying.map((impact) => <span key={impact.flagId} className="map-dialogue-tag">{impact.title}</span>)}
          </div>
        </div>
      )}

      {profile.handIns.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] px-2.5 py-2">
          <Handshake size={12} className="mt-0.5 shrink-0 text-cyan-100/70" aria-hidden="true" />
          <p className="text-[10px] leading-relaxed text-white/60">
            {t("map.itemStoryImpact.handInHint", { count: profile.handIns.length })}
          </p>
        </div>
      )}
    </section>
  );
};

export default MapItemStoryImpactProfileSection;
