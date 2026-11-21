import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_MAP_ID } from "../map/map-registry";
import DatabaseSectionTitle from "./database-section-title";
import ItemSourceRow from "./item-source-row";
import { getItemSourceArtwork } from "./item-source-artwork";
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
      // Keep the saved target clickable while its current name and region are unavailable.
      const fallbackId = resolved.length === 0 ? reward.markerId : undefined;
      const locations = fallbackId
        ? [{ mapId: DEFAULT_MAP_ID, markerId: fallbackId, name: reward.giver }] : resolved;
      const target = resolved.length === 1 ? resolved[0] : undefined;
      const giver = fallbackId ? undefined : target?.name ?? reward.giver;
      const faction = reward.faction === "Both" ? reward.faction : target?.questFaction ?? reward.faction;
      const details = [giver, t("database.itemResearch.level", { level: reward.level }),
        `×${reward.quantity}`, !fallbackId && faction && t(`database.questRewards.faction.${faction}`),
        reward.choice && t("database.itemResearch.choice"),
        reward.requiredItem && t("database.questRewards.requiredItem", { item: reward.requiredItem }),
      ].filter(Boolean).join(" · ");
      return <ItemSourceRow key={reward.questId} name={reward.name} icon={ScrollText} details={details}
        artwork={getItemSourceArtwork({ t: "quest" }, locations)}
        locations={locations} onOpenMap={onOpenMap} />;
    })}</div>
  </section>;
};

export default ItemQuestRewards;
