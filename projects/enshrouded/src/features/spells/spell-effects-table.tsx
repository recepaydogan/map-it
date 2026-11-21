import { useTranslation } from "react-i18next";
import SpellLink from "./spell-link";
import type { SpellDetail, SpellEffectNames, SpellIndexRow } from "./spell-data";

const ENCHANT_EFFECTS = new Set([53, 54, 92, 156, 360]);

const SpellEffectsTable = ({ detail, names, byId }: {
  detail: SpellDetail;
  names: SpellEffectNames | null;
  byId: Map<number, SpellIndexRow>;
}) => {
  const { t, i18n } = useTranslation();
  if (!detail.ef?.length) return null;
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 3 });

  return <div>
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border bg-surface">
      <table className="w-full min-w-[540px] border-collapse text-left text-[12px]">
        <thead className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-subtle"><tr>
          <th className="w-9 px-3 py-2">#</th><th className="px-3 py-2">{t("spells.whatItDoes")}</th>
          <th className="min-w-32 px-3 py-2">{t("spells.numbers")}</th><th className="px-3 py-2">{t("spells.target")}</th>
        </tr></thead>
        <tbody>{detail.ef.map((effect, index) => {
          const trigger = effect.tr || ((effect.a === 42 || effect.a === 23) && effect.v && effect.v > 1000 && byId.has(effect.v) ? effect.v : 0);
          const values = [
            !trigger && (effect.lo !== undefined ? `${number(effect.lo)}–${number(effect.hi ?? effect.lo)}` : effect.v !== undefined ? number(effect.v) : ""),
            effect.pl ? t("spells.perLevelValue", { value: `${effect.pl > 0 ? "+" : ""}${number(effect.pl)}` }) : "",
            effect.t ? t("spells.everySeconds", { count: number(effect.t / 1000) }) : "",
            effect.r ? t("spells.radius", { value: number(effect.r) }) : "",
            effect.ch && effect.ch > 1 ? t("spells.targetCount", { count: effect.ch }) : "",
            effect.sp ? t("spells.spellPowerMultiplier", { value: number(effect.sp) }) : "",
            effect.ap ? t("spells.attackPowerMultiplier", { value: number(effect.ap) }) : "",
            ENCHANT_EFFECTS.has(effect.e) && effect.m ? t("spells.enchantmentId", { id: effect.m }) : "",
          ].filter(Boolean);
          const effectName = names?.effects[String(effect.e)] ?? t("spells.effectNumber", { id: effect.e });
          const auraName = effect.a ? names?.auras[String(effect.a)] ?? t("spells.auraNumber", { id: effect.a }) : "";
          const target = trigger ? byId.get(trigger) : undefined;
          return <tr key={index} className="border-b border-border/60 align-top last:border-0">
            <td className="px-3 py-2.5 text-subtle">{index + 1}</td>
            <td className="px-3 py-2.5 text-zinc-100">
              <span className="font-semibold">{auraName || effectName}</span>
              {auraName && <> <span className="text-subtle">{effect.e === 6 ? t("spells.aura").toLowerCase() : effectName.toLowerCase()}</span></>}
              {trigger ? <span className="mt-1 block text-accent">→ {target ? <SpellLink id={trigger} name={target[1]} /> : t("spells.spellNumber", { id: trigger })}</span> : null}
              {effect.mc && <span className="mt-1 block text-[11px] text-subtle">{effect.mc}</span>}
            </td>
            <td className="px-3 py-2.5 tabular-nums text-zinc-300">{values.length ? <span className="block space-y-0.5">{values.map((value, valueIndex) => <span key={valueIndex} className="block">{value}</span>)}</span> : "—"}</td>
            <td className="px-3 py-2.5 text-zinc-300">{names?.targets[String(effect.tg)] ?? "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
};

export default SpellEffectsTable;
