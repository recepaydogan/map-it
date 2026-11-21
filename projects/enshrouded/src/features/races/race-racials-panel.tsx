import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { RaceEntry, RacialAbility } from "./race-types";
import SpellLink from "../spells/spell-link";

const RaceRacialsPanel = ({ entry }: { entry: RaceEntry }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const racialCard = (ability: RacialAbility) => {
    const patchedEureka = entry.id === "gnome" && ability.name === "Eureka!";
    const effect = patchedEureka ? t("races.patch.eureka") : ability.effect;
    const fullEffect = patchedEureka ? undefined : ability.fullEffect;
    return <article key={ability.name} className="min-w-0 rounded-[var(--radius-md)] border border-border bg-surface p-3">
    <div className="flex items-start gap-3">
      {ability.icon && <ItemIcon icon={ability.icon} name={ability.name} size={36} />}
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] font-semibold text-white">{ability.spellId ? <SpellLink id={ability.spellId} name={ability.name} /> : ability.name}</h4>
        <p className="mt-1 text-[12px] leading-5 text-zinc-300">{effect}</p>
      </div>
    </div>
    {fullEffect && fullEffect !== effect && <details className="group mt-2 border-t border-border/70 pt-2 text-[11px] text-subtle">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-accent marker:hidden">{t("races.fullEffect")}<ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <p className="mt-1.5 leading-5 text-zinc-300">{fullEffect}</p>
    </details>}
  </article>;
  };

  return <div className="space-y-7">
    {(["active", "passive"] as const).map((kind) => {
      const abilities = entry.racials.filter((ability) => ability.kind === kind);
      return <section key={kind}>
        <DatabaseSectionTitle count={abilities.length}>{t(`races.${kind}`)}</DatabaseSectionTitle>
        <div className="grid items-start gap-2 @min-[760px]:grid-cols-2">{abilities.map(racialCard)}</div>
      </section>;
    })}

    {!!entry.exclusiveAbilities.length && <section>
      <DatabaseSectionTitle count={entry.exclusiveAbilities.length}>{t("races.exclusiveAbilities")}</DatabaseSectionTitle>
      <div className="grid gap-2 @min-[760px]:grid-cols-2">{entry.exclusiveAbilities.map((ability) => <article key={ability.name} className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
        <div className="flex items-start gap-3">
          {ability.icon && <ItemIcon icon={ability.icon} name={ability.name} size={36} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h4 className="text-[13px] font-semibold text-white">{ability.name}</h4>
              {ability.new && <span className="rounded-[var(--radius-sm)] bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("races.new")}</span>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
              <button type="button" onClick={() => openReference({ category: "classes", id: ability.classId, name: ability.className })} className="cursor-pointer text-accent hover:underline">{ability.className}</button>
              <span>{t("races.level", { value: ability.level })}</span>
              {ability.ranks && <span>{t("races.ranks", { count: ability.ranks })}</span>}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-zinc-300">{ability.description}</p>
        {ability.valuesUnavailable && <p className="mt-1 text-[11px] text-subtle">{t("races.missingValues")}</p>}
      </article>)}</div>
      <p className="mt-2 text-[11px] text-subtle">{t("races.rankOneNote")}</p>
    </section>}

    {!!entry.removedRacials.length && <section>
      <DatabaseSectionTitle count={entry.removedRacials.length}>{t("races.removed")}</DatabaseSectionTitle>
      <div className="flex flex-wrap gap-2">{entry.removedRacials.map((name) => <span key={name} className="rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-[11px] text-subtle line-through">{name}</span>)}</div>
    </section>}

    {!!entry.regions.length && <section>
      <DatabaseSectionTitle count={entry.regions.length}>{t("races.relatedRegions")}</DatabaseSectionTitle>
      <div className="flex flex-wrap gap-2">{entry.regions.map((region) => <div key={region.name} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-[12px] text-zinc-200">
        {region.name}
      </div>)}</div>
    </section>}
  </div>;
};

export default RaceRacialsPanel;
