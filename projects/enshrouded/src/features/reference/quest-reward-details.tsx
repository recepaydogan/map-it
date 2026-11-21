import { useTranslation } from "react-i18next";
import MarkerRewardItem from "../database/marker-reward-item";
import ItemIcon from "../database/item-icon";
import type { DatabaseItem } from "../database/item-database-types";
import type { DungeonQuestItem } from "./dungeon-quest-data";
import { useReferenceNavigation } from "./reference-navigation-context";
import { itemMentions, type QuestRewardData } from "./quest-reward-utils";

export default function QuestRewardDetails({ quest, itemById, itemLinks = {} }: {
  quest: QuestRewardData;
  itemById: Map<string, DatabaseItem>;
  itemLinks?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const rewardItems = quest.rewardItems ?? [];
  const rewardChoices = quest.rewardChoices ?? [];
  const legacyReward = !rewardItems.length && !rewardChoices.length ? quest.reward : undefined;
  const [legacyMain, legacyExtra] = legacyReward?.split(/;\s*/, 2) ?? [];
  const knownItems = [...itemById.values()];
  const legacyChoices = legacyMain?.startsWith("Choose ")
    ? itemMentions(legacyMain, knownItems, itemLinks) : [];
  const legacyItems = legacyExtra ? itemMentions(legacyExtra, knownItems, itemLinks) : [];
  const legacyNote = legacyExtra && !legacyItems.length ? legacyExtra : undefined;
  const rewardRows = (items: DungeonQuestItem[]) => <div className="divide-y divide-border/60">
    {items.map((item) => {
      const known = itemById.get(item.id);
      const linkable = known && (!item.name || known.name === item.name);
      const name = item.name || known?.name || t("map.foreverQuest.undiscoveredReward", { id: item.id });
      return <MarkerRewardItem key={item.id} item={{ id: item.id, name, icon: item.icon ?? (linkable ? known.icon : undefined) }}
        quantity={item.quantity} onOpenItem={linkable ? () => openReference({ category: "items", id: item.id, name }) : undefined} />;
    })}
  </div>;

  return <>
    {!!rewardChoices.length && <><p className="mt-2 text-[11px] text-subtle">{t("dungeonQuest.chooseReward")}</p>{rewardRows(rewardChoices)}</>}
    {!!rewardItems.length && <>{!!rewardChoices.length && <p className="mt-2 text-[11px] text-subtle">{t("dungeonQuest.alsoReceive")}</p>}{rewardRows(rewardItems)}</>}
    {!!quest.currencyRewards?.length && <div className="mt-2 space-y-1">
      {quest.currencyRewards.map((currency) => <div key={currency.id}
        className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-1 py-2">
        <ItemIcon icon={currency.icon} name={currency.name} size={28} />
        <span className="min-w-0 text-[12px] font-medium text-zinc-100">{currency.name}</span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-accent">×{currency.quantity}</span>
      </div>)}
    </div>}
    {!!legacyChoices.length && <><p className="mt-2 text-[11px] text-subtle">{t("dungeonQuest.chooseReward")}</p>{rewardRows(legacyChoices)}</>}
    {!!legacyItems.length && rewardRows(legacyItems)}
    {legacyNote && <p className="mt-2 text-[11px] leading-relaxed text-subtle">{legacyNote}</p>}
    {legacyReward && !legacyChoices.length && !legacyItems.length && !legacyNote
      && <p className="mt-2 text-[11px] leading-relaxed text-subtle">{legacyReward}</p>}
    {(quest.experience || quest.money || quest.reputation?.length) && <dl className="mt-2 divide-y divide-border/60 text-[12px]">
      {!!quest.experience && <div className="py-1.5"><dt className="sr-only">{t("dungeonQuest.experience")}</dt><dd className="font-medium tabular-nums text-zinc-100">{t("dungeonQuest.experienceAmount", { amount: quest.experience.toLocaleString("en-US") })}</dd></div>}
      {quest.money && <div className="flex justify-between gap-4 py-1.5"><dt className="text-subtle">{t("dungeonQuest.money")}</dt><dd className="text-zinc-100">{quest.money}</dd></div>}
      {!!quest.reputation?.length && <div className="flex justify-between gap-4 py-1.5"><dt className="text-subtle">{t("dungeonQuest.reputation")}</dt><dd className="text-right text-zinc-100">{quest.reputation.join(" · ")}</dd></div>}
    </dl>}
  </>;
}
