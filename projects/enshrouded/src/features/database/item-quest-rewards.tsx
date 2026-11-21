import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "./database-section-title";
import type { ForeverQuestItemReward } from "./use-forever-quest-item-rewards";

const ItemQuestRewards = ({ rewards }: {
  rewards: ForeverQuestItemReward[];
}) => {
  const { t } = useTranslation();
  if (!rewards.length) return null;

  return <section className="max-w-[760px]">
    <DatabaseSectionTitle count={rewards.length}>{t("database.questRewards.title")}</DatabaseSectionTitle>
    <div className="space-y-1.5">{rewards.map((reward) => {
      const content = <>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-zinc-100">{reward.name}</span>
          <span className="mt-0.5 block text-[11px] text-zinc-400">
            {[reward.giver, reward.region, t("database.itemResearch.level", { level: reward.level }),
              reward.faction && t(`database.questRewards.faction.${reward.faction}`)].filter(Boolean).join(" · ")}
          </span>
          {reward.requiredItem && <span className="mt-0.5 block text-[11px] text-subtle">{t("database.questRewards.requiredItem", { item: reward.requiredItem })}</span>}
        </span>
        <span className="shrink-0 text-[11px] text-amber-300">×{reward.quantity}</span>
        {reward.choice && <span className="shrink-0 text-[10px] text-subtle">{t("database.itemResearch.choice")}</span>}
      </>;
      const className = "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-left";
      return <div key={reward.questId} className={className}>{content}</div>;
    })}</div>
  </section>;
};

export default ItemQuestRewards;
