import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemGrade from "./item-grade";
import CategoryDropdown from "../../components/category-dropdown";
import { formatDropChance } from "../../lib/format-drop-chance";
import type { ReferenceSection } from "../reference/reference-types";
import DatabaseSectionTitle from "./database-section-title";

const ItemImprintChances = ({ results }: { results: NonNullable<ReferenceSection["imprintResults"]> }) => {
  const { t, i18n } = useTranslation();
  const selectorId = useId();
  const [selected, setSelected] = useState("");
  const current = results.find((stat) => stat.name === selected) ?? results[0];
  if (!current) return null;

  return <section className="max-w-[760px] space-y-3">
    <DatabaseSectionTitle>{t("reference.labels.imprint-chances")}</DatabaseSectionTitle>
    <p className="text-[12px] leading-relaxed text-subtle">{t("database.imprintChances.notice")}</p>
    <div className="max-w-[360px] space-y-1.5">
      <label htmlFor={selectorId} className="block text-[12px] text-subtle">{t("database.imprintChances.bonus")}</label>
      <CategoryDropdown id={selectorId} ariaLabel={t("database.imprintChances.bonus")}
        value={current.name} onChange={setSelected}
        options={results.map((stat) => ({ key: stat.name, label: stat.name }))}
        contentClassName="scroll-slim max-h-[min(224px,var(--radix-dropdown-menu-content-available-height))] overscroll-contain"
        triggerClassName="py-2.5 pr-4" />
    </div>
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface" aria-live="polite">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{t("database.imprintChances.caption", { stat: current.name })}</caption>
        <thead className="border-b border-border text-[12px] text-subtle">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-normal">{t("database.imprintChances.result")}</th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">{t("database.imprintChances.chance")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {current.results.map((result, index) => <tr key={`${result.grade}-${index}`}>
            <th scope="row" className="px-4 py-3 font-medium text-zinc-100">
              {t("database.imprintChances.bonusValue", { stat: current.name,
                value: `${result.value > 0 ? "+" : ""}${result.value.toLocaleString(i18n.language)}${result.isPercent ? "%" : ""}` })}
              <ItemGrade grade={result.grade} className="mt-0.5 block text-[11px]" />
            </th>
            <td className="px-4 py-3 text-right font-medium tabular-nums text-accent">
              {formatDropChance(current.chance * result.chance / 100, i18n.language)}
            </td>
          </tr>)}
          {current.chance < 100 && <tr className="text-subtle">
            <th scope="row" className="px-4 py-3 font-normal">{t("database.imprintChances.otherBonus", { stat: current.name })}</th>
            <td className="px-4 py-3 text-right tabular-nums">{formatDropChance(100 - current.chance, i18n.language)}</td>
          </tr>}
        </tbody>
      </table>
    </div>
  </section>;
};

export default ItemImprintChances;
