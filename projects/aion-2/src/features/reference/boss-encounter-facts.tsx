import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { scriptedHpSummonTextKey } from "../../game-config";
import DatabaseSectionTitle from "../database/database-section-title";
import type { BossPanelFacts } from "./reference-types";

const BossEncounterFacts = ({ facts }: { facts?: BossPanelFacts }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  if (!facts?.dungeonRole && !facts?.scriptedHpPercent?.length && !facts?.fieldEvent) return null;
  return <section className="space-y-3">
    <DatabaseSectionTitle>{t("reference.guide.encounterDetails")}</DatabaseSectionTitle>
    {facts.dungeonRole && <p className="text-[13px] text-zinc-200">{t(`reference.guide.dungeonRole.${facts.dungeonRole}`)}</p>}
    {!!facts.scriptedHpPercent?.length && <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-300">{t("reference.guide.scriptedHpEvents")}</p>
      <div className="space-y-1.5">{facts.scriptedHpPercent.map((percent) => {
        const action = facts.scriptedHpActions?.find((item) => item.percent === percent);
        const summonTextKey = action?.summons && scriptedHpSummonTextKey(action.summons);
        return <div key={percent} className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent/20 bg-accent-soft px-2 py-1 text-xs tabular-nums text-zinc-200">{percent}%</span>
          {summonTextKey && <span className="text-xs leading-relaxed text-subtle">{t(summonTextKey)}</span>}
          {action?.startsWave && <span className="text-xs leading-relaxed text-subtle">{t("reference.guide.startsWave")}</span>}
        </div>;
      })}</div>
    </div>}
    {facts.fieldEvent && <details className="rounded-[var(--radius-sm)] border border-border bg-surface p-3">
      <summary className="cursor-pointer text-[13px] font-medium text-zinc-100">{gameText(facts.fieldEvent.title)}</summary>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-subtle">{gameText(facts.fieldEvent.description)}</p>
    </details>}
  </section>;
};

export default BossEncounterFacts;
