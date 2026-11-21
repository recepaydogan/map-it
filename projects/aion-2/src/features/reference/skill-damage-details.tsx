import { useTranslation } from "react-i18next";
import type { SkillDamageRecord } from "./reference-types";

const SkillDamageDetails = ({ damage, level, compact = false }: { damage: SkillDamageRecord; level: number; compact?: boolean }) => {
  const { t, i18n } = useTranslation();
  const rows = damage.effects.flatMap((effect, index) => {
    const values = effect.levels.find((entry) => entry[0] === level);
    return values ? [{ index, values }] : [];
  });
  const healing = (damage.healing ?? []).flatMap((effect, index) => {
    const values = effect.levels.find((entry) => entry[0] === level);
    return values ? [{ index, values }] : [];
  });
  if (!rows.length && !healing.length) return null;
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const range = (min: number, max: number, divisor = 1) => {
    const first = number(min / divisor);
    const last = number(max / divisor);
    return first === last ? first : `${first}–${last}`;
  };
  return <span className={compact ? "mt-2 block border-t border-border pt-2" : "block rounded-[var(--radius-md)] border border-border bg-background/50 p-3"}>
    <span className="mb-1.5 block text-[11px] font-semibold text-zinc-300">{t("reference.skillDamage.title", { level })}</span>
    {rows.map(({ index, values }) => <span key={damage.effects[index].id} className="block space-y-1 text-[11px]">
      {rows.length > 1 && <span className="block font-medium text-zinc-200">{t("reference.skillDamage.effect", { number: index + 1 })}</span>}
      <span className="flex justify-between gap-3"><span className="text-zinc-400">{t("reference.skillDamage.base")}</span><span className="tabular-nums text-zinc-100">{range(values[1], values[2])}</span></span>
      <span className="flex justify-between gap-3"><span className="text-zinc-400">{t("reference.skillDamage.coefficient")}</span><span className="tabular-nums text-zinc-100">{range(values[3], values[4], 100)}%</span></span>
    </span>)}
    {healing.map(({ index, values }) => <span key={damage.healing![index].id} className="block text-[11px]">
      <span className="flex justify-between gap-3"><span className="text-zinc-400">{t("reference.skillDamage.healing")}</span><span className="tabular-nums text-zinc-100">{range(values[1], values[2])}</span></span>
    </span>)}
  </span>;
};

export default SkillDamageDetails;
