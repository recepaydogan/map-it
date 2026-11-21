import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { humanize } from "../../lib/humanize";
import {
  groupMapCharacterResistances,
  isMapCharacterImmunity,
  isMapCharacterVulnerability,
} from "./map-character-combat-utils";
import { MapCombatTypeList } from "./map-combat-type";
import type { MapAbility, MapCharacterCombatProfile } from "./types";

const abilities: MapAbility[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    <div className="flex flex-col gap-1.5">{children}</div>
  </section>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
    {children}
  </div>
);

const MetaBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
    <span className="text-zinc-500">{label} </span>
    <span className="tabular-nums">{value}</span>
  </span>
);

interface MapCharacterProfileProps {
  name: string;
  profile: MapCharacterCombatProfile;
  onBack: () => void;
  onClose: () => void;
}

/** Full-panel combat readout, following the Elden Ring combat-intel hierarchy. */
const MapCharacterProfile = ({ name, profile, onBack, onClose }: MapCharacterProfileProps) => {
  const { t } = useTranslation();
  const abilityScores = abilities
    .map((ability) => ({ ability, value: profile.abilities?.[ability] }))
    .filter((entry): entry is { ability: MapAbility; value: string } => Boolean(entry.value));
  const meta = [
    profile.vitality && { label: t("map.character.baseVitality"), value: profile.vitality },
    profile.baseArmor && { label: t("map.character.baseArmor"), value: profile.baseArmor },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const traits = [
    profile.movement && { label: t("map.character.movement"), value: t("map.character.meters", { value: profile.movement }) },
    profile.darkvisionRange && { label: t("map.character.darkvision"), value: t("map.character.meters", { value: profile.darkvisionRange }) },
    profile.spellCastingAbility && {
      label: t("map.character.spellCastingAbility"),
      value: t(`map.character.abilities.${profile.spellCastingAbility.toLocaleLowerCase("en-US")}`, {
        defaultValue: profile.spellCastingAbility,
      }),
    },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const resistances = profile.resistances ?? [];
  const vulnerabilities = groupMapCharacterResistances(resistances.filter(isMapCharacterVulnerability));
  const immunities = groupMapCharacterResistances(resistances.filter(isMapCharacterImmunity));
  const reductions = groupMapCharacterResistances(resistances.filter((resistance) =>
    !isMapCharacterVulnerability(resistance) && !isMapCharacterImmunity(resistance)));

  const resistanceSentence = (value: string, types: string[]) => {
    const sentenceKey = value === "VulnerableToMagical"
      ? "vulnerableMagical"
      : value === "Vulnerable"
        ? "vulnerable"
        : value === "ImmuneToNonMagical"
          ? "immuneNonMagical"
          : value === "Resistant;Immune"
            ? "resistantImmune"
            : value === "Immune"
              ? "immune"
              : value === "ResistantToNonMagical"
                ? "resistantNonMagical"
                : "resistant";
    return (
      <Trans
        i18nKey={`map.character.sentences.${sentenceKey}`}
        components={{ types: <MapCombatTypeList types={types} /> }}
      />
    );
  };

  return (
    <>
      <button
        type="button"
        data-detail-back
        onClick={onBack}
        className="flex w-full shrink-0 cursor-pointer items-center gap-1 px-4 pt-3 text-xs font-medium text-zinc-400 hover:text-white"
      >
        <ChevronLeft size={15} aria-hidden="true" />
        <span className="truncate">{t("map.details.backTo", { location: name })}</span>
      </button>

      <header className="relative shrink-0 px-4 pb-3 pt-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.character.closeProfile")}
          className="absolute right-3 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
          {t("map.character.title")}
        </p>
        <h2 className="mt-0.5 pr-8 text-base font-semibold leading-tight text-white">{name}</h2>
        {meta.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {meta.map(({ label, value }) => <MetaBadge key={label} label={label} value={value} />)}
          </div>
        )}
      </header>

      <div className="scroll-slim min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-5">
        <div className="space-y-4">
          {vulnerabilities.length > 0 && (
            <Group title={t("map.character.weaknessesTitle")}>
              {vulnerabilities.map(({ value, types }) => (
                <Row key={value}>{resistanceSentence(value, types)}</Row>
              ))}
            </Group>
          )}

          {profile.statusImmunities && profile.statusImmunities.length > 0 && (
            <Group title={t("map.character.statusImmunitiesTitle")}>
              <Row>
                <Trans
                  i18nKey="map.character.sentences.statusImmune"
                  components={{ types: <MapCombatTypeList types={profile.statusImmunities} /> }}
                />
              </Row>
            </Group>
          )}

          {immunities.length > 0 && (
            <Group title={t("map.character.damageImmunitiesTitle")}>
              {immunities.map(({ value, types }) => (
                <Row key={value}>{resistanceSentence(value, types)}</Row>
              ))}
            </Group>
          )}

          {reductions.length > 0 && (
            <Group title={t("map.character.resistancesTitle")}>
              {reductions.map(({ value, types }) => (
                <Row key={value}>{resistanceSentence(value, types)}</Row>
              ))}
            </Group>
          )}

          {abilityScores.length > 0 && (
            <Group title={t("map.character.abilityScores")}>
              <dl className="map-character-abilities">
                {abilityScores.map(({ ability, value }) => (
                  <div key={ability}>
                    <dt aria-label={t(`map.character.abilities.${ability}`)}>
                      {t(`map.character.abilityShort.${ability}`)}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </Group>
          )}

          {traits.length > 0 && (
            <Group title={t("map.character.combatTraits")}>
              <Row>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {traits.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-zinc-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Row>
            </Group>
          )}

          {profile.passives && profile.passives.length > 0 && (
            <Group title={t("map.character.passives")}>
              <Row>{profile.passives.map(humanize).join(", ")}</Row>
            </Group>
          )}
        </div>
      </div>
    </>
  );
};

export default MapCharacterProfile;
