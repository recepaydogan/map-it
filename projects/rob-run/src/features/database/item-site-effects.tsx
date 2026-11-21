import { useTranslation } from "react-i18next";
import type { DatabaseItem } from "./item-database-types";
import DatabaseSectionTitle from "./database-section-title";
import SpellLink from "../spells/spell-link";
import { useGameText } from "../../i18n/game-text";

type SpellLinks = NonNullable<DatabaseItem["spellLinks"]>;
const fishingPoleEffect = /^When applied to your fishing pole, increases Fishing by (\d+) for (\d+) min(?:utes)?\.$/i;

const effectTrigger = (kind: "use" | "equip" | "proc") => kind === "equip" ? "equipped" : kind === "proc" ? "chance-on-hit" : "use";

const SpellRecord = ({ spell }: { spell: SpellLinks[number] }) => {
  const id = Number(spell.id);
  return Number.isInteger(id) && id > 0 ? <SpellLink id={id} name={spell.name} showIcon /> : <span>{spell.name}</span>;
};

const ItemSiteEffects = ({ effects = [], links = [], transparentCards = false }: { effects?: DatabaseItem["siteEffects"]; links?: DatabaseItem["spellLinks"]; transparentCards?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const groups = [...new Set(effects.map((effect) => effect.kind))].map((kind) => ({
    kind,
    descriptions: effects.filter((effect) => effect.kind === kind),
    spells: links.filter((spell) => spell.trigger === effectTrigger(kind)),
  }));
  const linkedTriggers = new Set<SpellLinks[number]["trigger"]>(groups.map(({ kind }) => effectTrigger(kind)));
  return <section className="@container w-full">
    <DatabaseSectionTitle>{t(effects.length ? "database.clientItem.effects" : "database.clientItem.linkedSpells")}</DatabaseSectionTitle>
    <div className="space-y-1.5">{groups.map(({ kind, descriptions, spells }) => <div key={kind}
      className={`rounded-[var(--radius-sm)] border border-border px-3 py-2.5 text-[13px]${transparentCards ? "" : " bg-white/[0.03]"}`}>
      <span className="block text-[11px] font-semibold text-accent">{t(kind === "use" && descriptions.every((effect) => fishingPoleEffect.test(effect.text))
        ? "database.clientItem.siteEffect.applyToFishingPole" : `database.clientItem.siteEffect.${kind}`)}</span>
      <div className="mt-1 divide-y divide-border">{descriptions.map((effect, index) => {
        const fishingBonus = kind === "use" ? fishingPoleEffect.exec(effect.text) : null;
        return <div key={`${kind}-${index}`} className="py-2 first:pt-0 last:pb-0">
          {descriptions.length === spells.length && spells[index] && <div className="mb-1 text-[12px]"><SpellRecord spell={spells[index]} /></div>}
          {fishingBonus ? <p className="leading-relaxed text-zinc-200">
            <strong className="font-semibold text-zinc-100">{t("database.clientItem.siteEffect.fishingBonus", { bonus: fishingBonus[1] })}</strong>
            <span className="text-zinc-400"> · {t("database.clientItem.siteEffect.durationMinutes", { minutes: fishingBonus[2] })}</span>
          </p> : <p className="leading-relaxed text-zinc-200">{gameText(effect.text)}</p>}
        </div>;
      })}
      {descriptions.length !== spells.length && spells.map((spell) => <div key={spell.id} className="py-2 text-[12px] first:pt-0 last:pb-0"><SpellRecord spell={spell} /></div>)}</div>
    </div>)}</div>
    {links.filter((spell) => !linkedTriggers.has(spell.trigger)).length > 0 && <div className="mt-1.5 grid gap-1.5 @min-[480px]:grid-cols-2">{links.filter((spell) => !linkedTriggers.has(spell.trigger)).map((spell) => <div key={spell.id} className={`rounded-[var(--radius-sm)] border border-border px-3 py-2.5 text-[12px]${transparentCards ? "" : " bg-white/[0.03]"}`}>
      <span className="mb-0.5 block text-[11px] font-semibold text-accent">{t(`database.clientItem.trigger.${spell.trigger}`)}</span>
      <SpellRecord spell={spell} />
    </div>)}</div>}
  </section>;
};

export default ItemSiteEffects;
