import { EyeOff, ScanSearch, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import MapDetailSection from "./map-detail-section";
import type { MapSpoilerLevel, MapWorldCheckProfile } from "./types";

interface MapWorldCheckProfileProps {
  level: MapSpoilerLevel;
  profile: MapWorldCheckProfile;
}

const MapWorldCheckProfileSection = ({ level, profile }: MapWorldCheckProfileProps) => {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const localizedSkill = (skill?: string) => skill
    ? t(`map.spoilers.worldChecks.skills.${skill.toLocaleLowerCase("en-US")}`, {
      defaultValue: skill.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
    })
    : t("map.spoilers.worldChecks.unknownSkill");
  const typeLabel = (type: "knowledge-check" | "skill-check" | "saving-throw" | "ambush") => t(
    type === "ambush"
      ? "map.spoilers.worldChecks.ambush"
      : type === "saving-throw"
        ? "map.spoilers.worldChecks.savingThrow"
        : type === "skill-check"
          ? "map.spoilers.worldChecks.skillCheck"
          : "map.spoilers.worldChecks.knowledge",
  );

  return (
    <>
      {(["knowledge-check", "skill-check", "saving-throw", "ambush"] as const).map((type) => {
        const checks = profile.checks.filter((check) => check.type === type);
        if (checks.length === 0) return null;
        return (
          <MapDetailSection key={type} title={typeLabel(type)}>
            {level === "hint" && (
              <p className="flex items-start gap-2 text-[12px] leading-relaxed text-subtle">
                <EyeOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {t("map.spoilers.worldChecks.hidden")}
              </p>
            )}

            {(level === "guide" || level === "full") && (
              <div className="space-y-2">
                {checks.map((check) => {
                  const descriptions = GAME_CONFIG.worldCheckDescriptions?.[check.id];
                  const description = descriptions?.[language] ?? descriptions?.en;
                  return (
                    <article key={check.id} className="rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2.5">
                      <div className="flex items-start gap-2 text-subtle">
                        {check.type === "ambush"
                          ? <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          : <ScanSearch size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-5 text-zinc-100 break-words">
                            {level === "full" ? check.title : check.type === "ambush" ? typeLabel(check.type) : localizedSkill(check.skill)}
                          </p>
                          {(level === "full" || check.type === "ambush") && (
                            <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{localizedSkill(check.skill)}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[12px] font-semibold leading-5 text-subtle">{check.difficultyClass !== undefined
                          ? t("map.spoilers.worldChecks.dc", { value: check.difficultyClass })
                          : t("map.spoilers.worldChecks.unknownDc")}</span>
                      </div>
                      {description && <p className="mt-2 text-[12px] leading-relaxed text-subtle">{description}</p>}
                      {check.type === "ambush" && check.ambushers && check.ambushers.length > 0 && (
                        <div className="mt-2 pl-[22px] text-[12px] leading-relaxed text-subtle">
                          <p>{t("map.spoilers.worldChecks.ambushers", { count: check.ambushers.length })}</p>
                          <ul className="mt-1 space-y-1">
                            {check.ambushers.map((ambusher) => (
                              <li key={ambusher.contentId} className="break-words text-zinc-100">
                                {ambusher.localizedTitles?.[i18n.language] ?? ambusher.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {level !== "hint" && (
              <p className="mt-2.5 text-[12px] leading-relaxed text-subtle">{t("map.spoilers.worldChecks.conditional")}</p>
            )}
          </MapDetailSection>
        );
      })}
    </>
  );
};

export default MapWorldCheckProfileSection;
