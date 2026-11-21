import { ArrowUpRight, BookOpenCheck, MapPin, Shield, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapDetailSection from "./map-detail-section";
import type { MapPartyMemberDefinition, MapPartyMemberProfile, MapSearchIndexLocation } from "./types";

interface MapPartyMemberProfileProps {
  profile: MapPartyMemberProfile;
  /** Every other position of this member the global index knows, any map. */
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

/**
 * A recruitable origin: who they are (race, class, quests) and every place the
 * story puts them. The current marker's condition is shown first; the other
 * conditional positions link straight to their markers.
 */
const MapPartyMemberProfileSection = ({ profile, locations, onSelect }: MapPartyMemberProfileProps) => {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const localized = (values?: Record<string, string> | null) => values?.[language] ?? values?.en;
  const name = (definition?: MapPartyMemberDefinition | null) => definition ? localized(definition.localizedNames) : undefined;
  // "Half-Elf (High Half-Elf)" reads better than repeating the same word twice.
  const withVariant = (base?: string, variant?: string) => {
    if (!base) return variant;
    if (!variant || variant === base) return base;
    return `${base} (${variant})`;
  };
  const race = withVariant(name(profile.race), name(profile.subRace));
  const characterClass = withVariant(name(profile.class), name(profile.subClass));
  const quests = profile.quests.map((quest) => localized(quest.localizedTitles) ?? quest.id);
  const current = profile.positions.find((position) => position.id === profile.currentPositionId);
  const others = profile.positions.filter((position) => position.id !== profile.currentPositionId);
  const facts = [
    race && { icon: UserRound, label: t("map.partyMember.race"), value: race },
    characterClass && { icon: Shield, label: t("map.partyMember.class"), value: characterClass },
  ].filter((fact): fact is { icon: typeof UserRound; label: string; value: string } => Boolean(fact));

  return (
    <MapDetailSection id="map-party-member-heading" title={t("map.partyMember.title")}>
      {facts.length > 0 && (
        <dl className="map-character-facts">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <dt><Icon size={12} aria-hidden="true" />{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {quests.length > 0 && (
        <div className="map-character-section">
          <h4>{t("map.partyMember.quests")}</h4>
          <ul className="map-character-tags">
            {quests.map((quest) => (
              <li key={quest} className="flex items-center gap-1">
                <BookOpenCheck size={11} className="shrink-0 text-amber-300" aria-hidden="true" />
                {quest}
              </li>
            ))}
          </ul>
        </div>
      )}

      {current && localized(current.localizedConditions) && (
        <div className="map-character-section">
          <h4>{t("map.partyMember.thisLocation")}</h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-subtle">{localized(current.localizedConditions)}</p>
        </div>
      )}

      {others.length > 0 && (
        <div className="map-character-section">
          <h4>{t("map.partyMember.otherLocations")}</h4>
          <div className="mt-1.5 grid gap-1.5">
            {others.map((position) => {
              const location = locations.find(({ contentId }) => contentId === position.contentId);
              const condition = localized(position.localizedConditions);
              const context = location
                ? [...new Set([location.mapName, location.region].filter(Boolean))].join(" · ")
                : position.level;
              const body = (
                <>
                  <MapPin size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[11px] font-semibold text-white">{context}</strong>
                    {condition && <span className="mt-0.5 block text-[11px] leading-relaxed text-white/70">{condition}</span>}
                  </span>
                </>
              );
              const className = "flex w-full items-start gap-2 rounded-[var(--radius-md)] border border-border bg-white/5 px-2.5 py-2 text-left";
              return location ? (
                <button
                  key={position.id}
                  type="button"
                  onClick={() => onSelect(location)}
                  title={t("map.partyMember.openLocation", { name: location.name, map: location.mapName })}
                  className={cn(className, "cursor-pointer transition-colors hover:border-accent/50 hover:bg-white/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}
                >
                  {body}
                  <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-white/70" aria-hidden="true" />
                </button>
              ) : (
                <div key={position.id} className={className}>{body}</div>
              );
            })}
          </div>
        </div>
      )}
    </MapDetailSection>
  );
};

export default MapPartyMemberProfileSection;
