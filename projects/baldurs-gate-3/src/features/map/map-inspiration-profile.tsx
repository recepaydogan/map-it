import { BookOpenText, Lightbulb, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapInspirationProfile } from "./types";

const MapInspirationProfileSection = ({ profile }: { profile: MapInspirationProfile }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-inspiration-profile-title">
      <div className="flex items-center gap-2">
        <Lightbulb size={13} className="text-violet-300" aria-hidden="true" />
        <h4 id="map-inspiration-profile-title">{t("map.inspiration.title")}</h4>
      </div>
      <p className="map-dialogue-hint">{t("map.inspiration.hint")}</p>
      <div className="mt-2 grid gap-2">
        {profile.events.map((event) => {
          const background = event.background?.localizedNames?.[language]
            ?? event.background?.localizedNames?.en;
          const title = event.localizedTitles?.[language] ?? event.localizedTitles?.en;
          const description = event.localizedDescriptions?.[language] ?? event.localizedDescriptions?.en;
          const backgroundDescription = event.background?.localizedDescriptions?.[language]
            ?? event.background?.localizedDescriptions?.en;
          const characters = (event.characters ?? [])
            .map(({ localizedNames }) => localizedNames[language] ?? localizedNames.en)
            .filter(Boolean);
          return (
            <article key={event.id} className="rounded-[var(--radius-md)] border border-violet-300/15 bg-violet-300/[0.035] p-2.5">
              <strong className="block text-[12px] font-semibold text-white">{title}</strong>
              {description && <p className="mt-1 text-[11px] leading-relaxed text-white/80">{description}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {characters.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-sky-200/20 bg-sky-200/8 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
                    <UserRound size={10} aria-hidden="true" />
                    {t("map.categories.npc")}: {characters.join(", ")}
                  </span>
                )}
                {background && (
                  <span className="rounded-[var(--radius-full)] border border-violet-300/20 bg-violet-300/8 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                    {t("map.inspiration.background")}: {background}
                  </span>
                )}
                <span className="rounded-[var(--radius-full)] border border-amber-200/20 bg-amber-200/8 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                  {t("map.inspiration.points", { count: event.inspirationPoints })}
                </span>
                <span className="rounded-[var(--radius-full)] border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                  {t("map.inspiration.rewardLevel", { level: event.rewardLevel })}
                </span>
              </div>
              {backgroundDescription && (
                <div className="mt-2 flex items-start gap-1.5 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/75">
                  <BookOpenText size={11} className="mt-0.5 shrink-0 text-violet-200" aria-hidden="true" />
                  <p>{backgroundDescription}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default MapInspirationProfileSection;
