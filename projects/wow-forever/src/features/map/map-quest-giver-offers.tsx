import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import { useGameText } from "../../i18n/game-text";
import { localizeQuestOfferName } from "./localize-quest-offer-name";
import type { MapLocation } from "./types";
import QuestCompletedTag from "../character-sync/quest-completed-tag";

export default function MapQuestGiverOffers({ point, selectedQuestId, onSelectQuest }: {
  point: MapLocation;
  selectedQuestId?: string;
  onSelectQuest?: (questId: string) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const rawOffers = point.questOffers ?? [];
  const offers = rawOffers.length > 1 && rawOffers.every((offer) => offer.name === rawOffers[0]?.name && offer.objectiveItem)
    ? [...rawOffers].sort((left, right) => Number(left.id) - Number(right.id))
    : rawOffers;
  if (!offers.length) return null;
  const groups = ([
    ["normal", "map.questGivers.normalQuests"],
    ["repeatable", "map.questGivers.repeatableQuests"],
    ["dungeon", "map.questGivers.dungeonQuests"],
  ] as const).map(([kind, labelKey]) => ({ kind, labelKey,
    offers: offers.filter((offer) => (offer.kind ?? "normal") === kind) }))
    .filter((group) => group.offers.length > 0);

  return <section className="mt-4 border-t border-border pt-4">
    {groups.map((group, index) => <div key={group.kind}
      className={cn(index > 0 && "mt-4 border-t border-border pt-4")}>
      <h4 className="map-micro-label mb-2">
        {t(group.labelKey)} <span>({group.offers.length})</span>
      </h4>
      <div className="space-y-1">
      {group.offers.map((offer) => <button key={offer.id} type="button"
        onClick={() => onSelectQuest?.(offer.id)} aria-pressed={selectedQuestId === offer.id}
        className={cn("flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-3.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          selectedQuestId === offer.id
            ? "border-accent/60 bg-accent/10 text-white"
            : "border-border text-zinc-200 hover:border-accent/40 hover:bg-white/[0.04]")}>
        <span className="min-w-0 flex-1">
          <span className="block">{localizeQuestOfferName(offer.name, offer.id, gameText)}</span>
          <QuestCompletedTag questId={offer.id} />
          {offer.objectiveItem && <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed text-subtle">
            <ItemIcon icon={offer.objectiveItem.icon} name={gameText(offer.objectiveItem.name, `ItemSparse:${offer.objectiveItem.id}:4`)} size={18} />
            {gameText(offer.objectiveItem.name, `ItemSparse:${offer.objectiveItem.id}:4`)} · {t(`map.foreverQuest.itemQuality.${offer.objectiveItem.quality}`)}
          </span>}
          {!!offer.objectiveItems?.length && <span className="mt-1 block text-[11px] leading-relaxed text-subtle">
            {offer.objectiveItems.map((item) =>
              `${gameText(item.name, `ItemSparse:${item.id}:4`)} ×${item.quantity}`).join(" · ")}
          </span>}
          {offer.currencyRewards?.map((currency) => <span key={currency.id}
            className="mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed text-zinc-200">
            <ItemIcon icon={currency.icon} name={gameText(currency.name, `CurrencyTypes:${currency.id}:0`)} size={18} />
            {gameText(currency.name, `CurrencyTypes:${currency.id}:0`)} ×{currency.quantity}
          </span>)}
          {offer.reward && <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-300">{gameText(offer.reward)}</span>}
        </span>
        <span className="shrink-0 text-[11px] text-subtle">{t("map.foreverQuest.level", { level: offer.level })}</span>
        <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>)}
      </div>
    </div>)}
  </section>;
}
