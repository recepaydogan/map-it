import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import SpellIcon from "../spells/spell-icon";
import SpellLink from "../spells/spell-link";
import { SpellConnections, SpellPartOf } from "../spells/spell-connections";
import { getSpellDescription } from "../spells/spell-description";
import { useLocalizedSpellText } from "../spells/spell-locales";
import { loadSpellEffectNames, type SpellEffectNames, useSpellDetail, useSpellIndex } from "../spells/spell-data";

const MapSpellPanel = ({ spellId }: { spellId: string }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const localizedSpellText = useLocalizedSpellText();
  const id = Number(spellId);
  const { detail, error } = useSpellDetail(Number.isSafeInteger(id) && id > 0 ? id : null);
  const { rows } = useSpellIndex();
  const byId = useMemo(() => new Map(rows?.map((row) => [row[0], row]) ?? []), [rows]);
  const [names, setNames] = useState<SpellEffectNames | null>(null);
  useEffect(() => {
    let active = true;
    void loadSpellEffectNames().then((value) => { if (active) setNames(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!detail) return <p role={error || !Number.isSafeInteger(id) || (rows && !byId.has(id)) ? "alert" : "status"}
    className="px-4 py-5 text-sm text-subtle">{t(error || !Number.isSafeInteger(id) || (rows && !byId.has(id)) ? "spells.detailError" : "reference.loading")}</p>;

  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 3 });
  const time = (ms: number) => ms < 0 ? "∞" : ms < 60_000
    ? t("spells.mapPanel.seconds", { value: number(ms / 1000) })
    : t("spells.mapPanel.minutes", { value: number(ms / 60_000) });
  const name = gameText(detail.n, `SpellName:${id}:0`);
  const translated = localizedSpellText(id);
  const description = getSpellDescription(translated?.d ?? detail.d, translated?.a ?? detail.a);
  const stats: { label: string; value: string }[] = [];
  if (detail.co?.length) stats.push({ label: t("spells.cost"), value: detail.co.map(([amount, resource, percent]) =>
    `${number(amount)}${percent ? `% ${t("spells.ofBase")}` : ""} ${gameText(resource)}`).join(" · ") });
  stats.push({ label: t("spells.cast"), value: detail.pa ? t("spells.passive") : detail.ct ? time(detail.ct) : t("spells.instant") });
  if (detail.rg) stats.push({ label: t("spells.range"), value: t("spells.mapPanel.yards", { value: `${detail.rg[0] ? `${number(detail.rg[0])}–` : ""}${number(detail.rg[1])}` }) });
  if (detail.cd && detail.cd > 0) stats.push({ label: t("spells.cooldown"), value: time(detail.cd) });
  if (detail.du) stats.push({ label: t("spells.duration"), value: time(detail.du) });
  if (detail.lv !== undefined) stats.push({ label: t("spells.level"), value: number(detail.lv) });
  if (detail.sc) stats.push({ label: t("spells.school"), value: gameText(detail.sc) });
  if (detail.dt) stats.push({ label: t("spells.dispelType"), value: gameText(detail.dt) });
  if (detail.mc) stats.push({ label: t("spells.mechanic"), value: gameText(detail.mc) });
  if (detail.pc) stats.push({ label: t("spells.procChance"), value: `${number(detail.pc)}%` });
  if (detail.sp) stats.push({ label: t("spells.spellPowerCoefficient"), value: number(detail.sp) });
  const hasExtra = !!(detail.ef?.length || detail.of || detail.tr?.length || detail.tb?.length);

  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
    <header className="flex min-w-0 items-center gap-3">
      <SpellIcon id={detail.ic} name={name} size={46} />
      <div className="min-w-0">
        <h2 className="break-words text-[16px] font-semibold leading-snug text-white">{name}</h2>
        {detail.r && <p className="mt-0.5 text-xs text-subtle">{translated?.r ?? detail.r}</p>}
      </div>
    </header>

    {description && <p className="mt-4 text-[13px] leading-6 text-zinc-100">{description}</p>}
    {detail.unavailableInSnapshot && <p className="mt-3 text-xs leading-5 text-subtle">{t("spells.unavailableInSnapshot")}</p>}
    {detail.retired && <p className="mt-3 text-xs leading-5 text-subtle">{t("spells.retired")}</p>}

    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
      {stats.map(({ label, value }) => <div key={label} className="min-w-0">
        <dt className="text-[11px] text-subtle">{label}</dt>
        <dd className="mt-0.5 break-words text-[13px] font-medium text-white">{value}</dd>
      </div>)}
    </dl>

    {hasExtra && <details className="group mt-5 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-xs font-medium text-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {t("spells.mapPanel.moreDetails")}<ChevronDown size={15} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-4">
        {!!detail.ef?.length && <section aria-label={t("spells.effects")}>
          <h3 className="mb-2 text-[11px] font-medium text-subtle">{t("spells.effects")}</h3>
          <ol className="space-y-2">{detail.ef.map((effect, index) => {
          const trigger = effect.tr || ((effect.a === 42 || effect.a === 23) && effect.v && effect.v > 1000 && byId.has(effect.v) ? effect.v : 0);
          const effectName = effect.a ? t(`spells.auraNames.${effect.a}`, {
            defaultValue: names?.auras[String(effect.a)] ?? t("spells.auraNumber", { id: effect.a }),
          }) : t(`spells.effectNames.${effect.e}`, {
            defaultValue: names?.effects[String(effect.e)] ?? t("spells.effectNumber", { id: effect.e }),
          });
          const values = [!trigger && (effect.lo !== undefined ? `${number(effect.lo)}–${number(effect.hi ?? effect.lo)}` : effect.v !== undefined ? number(effect.v) : ""),
            effect.pl ? t("spells.perLevelValue", { value: `${effect.pl > 0 ? "+" : ""}${number(effect.pl)}` }) : "",
            effect.t ? t("spells.everySeconds", { count: number(effect.t / 1000) }) : "",
            effect.r ? t("spells.radius", { value: number(effect.r) }) : "",
            effect.ch && effect.ch > 1 ? t("spells.targetCount", { count: effect.ch }) : "",
            effect.sp ? t("spells.spellPowerMultiplier", { value: number(effect.sp) }) : "",
            effect.ap ? t("spells.attackPowerMultiplier", { value: number(effect.ap) }) : "",
            [53, 54, 92, 156, 360].includes(effect.e) && effect.m ? t("spells.enchantmentId", { id: effect.m }) : ""].filter(Boolean);
          const targetName = effect.tg ? t(`spells.targetNames.${effect.tg}`, {
            defaultValue: names?.targets[String(effect.tg)] ?? "",
          }) : undefined;
          const triggeredSpell = trigger ? byId.get(trigger) : undefined;
          return <li key={index} className="rounded-[var(--radius-sm)] border border-border bg-elevated px-3 py-2.5 text-xs">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 break-words font-semibold text-white">{effectName}</span>
              {values[0] && <span className="shrink-0 font-semibold tabular-nums text-white">{values[0]}</span>}
            </div>
            {values.length > 1 && <p className="mt-1 break-words leading-5 text-subtle">{values.slice(1).join(" · ")}</p>}
            {targetName && <p className="mt-1 leading-5 text-subtle">{t("spells.target")}: {targetName}</p>}
            {trigger ? <p className="mt-1">{triggeredSpell ? <SpellLink id={trigger} name={triggeredSpell[1]} /> : t("spells.spellNumber", { id: trigger })}</p> : null}
            {effect.mc && <p className="mt-1 leading-5 text-subtle">{effect.mc}</p>}
          </li>;
        })}</ol>
        </section>}
        {!!(detail.of || detail.tr?.length || detail.tb?.length) && <section className="space-y-2" aria-label={t("spells.related")}>
          <h3 className="text-[11px] font-medium text-subtle">{t("spells.related")}</h3>
          <SpellPartOf detail={detail} byId={byId} />
          <SpellConnections detail={detail} byId={byId} />
        </section>}
      </div>
    </details>}
  </article>;
};

export default MapSpellPanel;
