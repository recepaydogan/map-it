import { useRewardOrder } from "./use-reward-order";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { formatDropChance } from "../../lib/format-drop-chance";
import MarkerRewardItem from "./marker-reward-item";
import ItemGrade from "./item-grade";
import type { MarkerRewardGroup } from "./use-marker-items";

const MarkerRewardPackage = ({ pack, onOpenItem }: {
  pack: MarkerRewardGroup["packages"][number]; onOpenItem?: (id: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const orderRewards = useRewardOrder();
  const chance = (value: number) => value > 100_000_000
    ? t("reference.dungeon.multipleRewards") : formatDropChance(value / 1_000_000, i18n.language);
  return <details className="group/reward rounded-[var(--radius-sm)] border border-border">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-zinc-100">
          {pack.grade && <><ItemGrade grade={pack.grade} />{" "}</>}
          {t("database.acquisition.rewardEquipment", {
            grade: "", family: t(`database.acquisition.rewardFamily${pack.family[0].toUpperCase()}${pack.family.slice(1)}`),
          })}
        </span>
        <span className="mt-0.5 block text-[11px] text-subtle">{t("database.acquisition.rewardSelection", { count: pack.count, options: pack.items.length })}</span>
      </span>
      {pack.probability !== 100_000_000 && <span className="shrink-0 text-[12px] tabular-nums text-zinc-200">{chance(pack.probability)}</span>}
      <ChevronDown size={14} className="shrink-0 text-subtle transition-transform group-open/reward:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-border px-2 pb-2">
      <p className="px-1 py-2 text-[11px] leading-4 text-subtle">{t("database.acquisition.rewardSelectionHint", { count: pack.count })}</p>
      <div className="flex justify-between gap-2 px-1 pb-1 text-[10px] text-subtle">
        <span>{t("database.acquisition.rewardItem")}</span><span>{t("database.acquisition.selectionChance")}</span>
      </div>
      <ProgressiveList initialCount={8} className="divide-y divide-border">
        {orderRewards(pack.items).map((item) => <MarkerRewardItem key={item.id} item={item} chance={chance(item.probability)} onOpenItem={onOpenItem} />)}
      </ProgressiveList>
    </div>
  </details>;
};

export default MarkerRewardPackage;
