import { useTranslation } from "react-i18next";
import { formatDropChance } from "../../lib/format-drop-chance";
import type { ReferenceRewardRate } from "./reference-types";
import { groupWorldObjectOutcomes, visibleOutcomeFactions, worldObjectRewardOutcomes } from "./world-object-reward-outcomes";

export default function WorldObjectRewardRates({ rates }: { rates: ReferenceRewardRate[] }) {
  const { t, i18n } = useTranslation();
  const groups = groupWorldObjectOutcomes(worldObjectRewardOutcomes(rates));
  const number = (value: number) => value.toLocaleString(i18n.language);
  return <span className="mt-2 block space-y-2 text-[11px] tabular-nums">
    {groups.map((group, groupIndex) => <span className="block" key={groupIndex}>
      {(visibleOutcomeFactions(group.factions).length > 0 || group.contextKey) && <span className="mb-1.5 block text-[10px] text-subtle">
        {[visibleOutcomeFactions(group.factions).map((faction) => t(`reference.worldObject.factions.${faction}`)).join(" / "),
          group.contextKey ? t(group.contextKey) : ""].filter(Boolean).join(" · ")}
      </span>}
      <span role="table" className="block overflow-hidden rounded-[var(--radius-sm)] bg-surface">
        {Array.from({ length: Math.ceil(group.outcomes.length / 6) }, (_, block) => {
          const outcomes = group.outcomes.slice(block * 6, block * 6 + 6);
          const style = { gridTemplateColumns: `minmax(48px, auto) repeat(${outcomes.length}, minmax(0, 1fr))` };
          return <span role="rowgroup" key={block} className="block border-t border-border first:border-t-0">
            <span role="row" className="grid items-stretch" style={style}>
              <span role="rowheader" className="flex items-center justify-center px-1 py-1.5 text-center text-subtle">{t("reference.activity.rewardQuantity")}</span>
              {outcomes.map((outcome, index) => <span role="cell" key={index} className="flex min-w-0 flex-col items-center justify-center border-l border-border px-1 py-1.5 text-center font-medium text-zinc-100 [overflow-wrap:anywhere]">
                ×{outcome.quantityMin === outcome.quantityMax ? number(outcome.quantityMin)
                  : `${number(outcome.quantityMin)}–${number(outcome.quantityMax)}`}
              </span>)}
            </span>
            <span role="row" className="grid items-stretch border-t border-border" style={style}>
              <span role="rowheader" className="flex items-center justify-center px-1 py-1.5 text-center text-subtle">{t("reference.activity.rewardChance")}</span>
              {outcomes.map((outcome, index) => <span role="cell" key={index} className="flex min-w-0 flex-col items-center justify-center border-l border-border px-1 py-1.5 text-center text-accent [overflow-wrap:anywhere]">
                {formatDropChance(outcome.percent, i18n.language)}
                {outcome.draws > 1 && <span className="block text-subtle">{t("reference.worldObject.draws", { count: outcome.draws })}</span>}
              </span>)}
            </span>
          </span>;
        })}
      </span>
    </span>)}
  </span>;
}
