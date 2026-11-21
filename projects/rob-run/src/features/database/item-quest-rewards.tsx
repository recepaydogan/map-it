import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_MAP_ID } from "../map/map-registry";
import DatabaseSectionTitle from "./database-section-title";
import ItemSourceRow from "./item-source-row";
import { getItemSourceMapLocations } from "./item-source-map-links";
import { useItemSourceMapLinks } from "./use-item-source-map-links";
import type { ForeverQuestItemReward } from "./use-forever-quest-item-rewards";

const ItemQuestRewards = ({ rewards, onOpenMap }: {
  rewards: ForeverQuestItemReward[];
  onOpenMap?: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const maps = useItemSourceMapLinks(rewards.length > 0);
  if (!rewards.length) return null;

  return <section className="@container max-w-[760px]">
    <DatabaseSectionTitle count={rewards.length}>{t("database.questRewards.title")}</DatabaseSectionTitle>
    <div className="border-y border-border">{rewards.map((reward) => {
      const resolved = getItemSourceMapLocations({ t: "quest", q: Number(reward.questId) }, maps.index);
      // Published reward records retain their exact quest marker as an offline-index fallback.
      const locations = resolved.length ? resolved : reward.markerId
        ? [{ mapId: DEFAULT_MAP_ID, markerId: reward.markerId, name: reward.giver, region: reward.region }] : [];
      const details = [reward.giver, t("database.itemResearch.level", { level: reward.level }),
        `×${reward.quantity}`, reward.faction && t(`database.questRewards.faction.${reward.faction}`),
        reward.choice && t("database.itemResearch.choice"),
        reward.requiredItem && t("database.questRewards.requiredItem", { item: reward.requiredItem }),
      ].filter(Boolean).join(" · ");
      return <ItemSourceRow key={reward.questId} name={reward.name} icon={ScrollText} details={details}
        locations={locations} onOpenMap={onOpenMap} />;
    })}</div>
  </section>;
};

export default ItemQuestRewards;
