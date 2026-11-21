import { useRewardOrder } from "./use-reward-order";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { formatDropChance } from "../../lib/format-drop-chance";
import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import FirstKillTitles from "../reference/first-kill-titles";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import type { ReferenceLink } from "../reference/reference-types";
import DatabaseSectionTitle from "./database-section-title";
import DropSearchHeader from "./drop-search-header";
import { getItemRewardQuantity } from "./item-reward-quantity";
import MarkerRewardItem from "./marker-reward-item";
import MarkerRewardPackage from "./marker-reward-package";
import type { MarkerRewardGroup } from "./use-marker-items";

const MapMarkerRewards = ({ groups, firstKillTitles = [], supplementalDrops = [], worldBoss = false, onOpenItem }: {
  groups: MarkerRewardGroup[]; firstKillTitles?: ReferenceLink[]; supplementalDrops?: ReferenceLink[];
  worldBoss?: boolean; onOpenItem?: (id: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const orderRewards = useRewardOrder();
  const [dropQuery, setDropQuery] = useState("");
  const order = ["participation", "main", "additional", "shared"] as const;
  const visibleGroups = order.flatMap((kind) => groups.filter((group) => group.kind === kind
    && (!worldBoss || kind === "participation" || kind === "main")));
  const search = supplementalDrops.length > 30 ? dropQuery.trim().toLocaleLowerCase() : "";
  const visibleDrops = search ? supplementalDrops.filter((item) =>
    gameText(getItemDisplayName(item.name), `ItemSparse:${item.id}:4`).toLocaleLowerCase().includes(search)) : supplementalDrops;
  const content = (group: MarkerRewardGroup, index: number) => <div key={`${group.kind}-${index}`} className="space-y-2">
    <DatabaseSectionTitle count={group.items.length + group.packages.reduce((count, pack) => count + pack.items.length, 0)}>{t(`database.acquisition.rewardGroup${group.kind[0].toUpperCase()}${group.kind.slice(1)}`)}</DatabaseSectionTitle>
    {!!group.items.length && <div>
      <ProgressiveList initialCount={8} className="divide-y divide-border">
        {orderRewards(group.items).map((item) => <MarkerRewardItem key={item.id} item={item} onOpenItem={onOpenItem}
          chance={item.probability > 100_000_000 ? t("reference.dungeon.multipleRewards") : formatDropChance(item.probability / 1_000_000, i18n.language)} />)}
      </ProgressiveList>
    </div>}
    {group.packages.map((pack, index) => <MarkerRewardPackage key={index} pack={pack} onOpenItem={onOpenItem} />)}
  </div>;

  if (!visibleGroups.length && !firstKillTitles.length && !supplementalDrops.length) return null;
  return <div className="space-y-4">
    {visibleGroups.map(content)}
    {!!supplementalDrops.length && <section className="space-y-2">
      <DropSearchHeader title={t("database.acquisition.possibleDrops", { count: supplementalDrops.length })}
        count={supplementalDrops.length} query={dropQuery} onQueryChange={setDropQuery} />
      <ProgressiveList initialCount={search ? visibleDrops.length : 8} className="divide-y divide-border">
        {orderRewards(visibleDrops).map((item) => <MarkerRewardItem key={item.id} item={item} onOpenItem={onOpenItem}
          quantity={getItemRewardQuantity(item)} chance={<ReferenceRewardRates rates={item.rewardRates} compact />} />)}
      </ProgressiveList>
      {search && !visibleDrops.length && <p className="text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
    </section>}
    <FirstKillTitles titles={firstKillTitles} />
  </div>;
};

export default MapMarkerRewards;
