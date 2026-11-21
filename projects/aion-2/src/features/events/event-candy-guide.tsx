import { ArrowRight, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import { EVENT_CANDY_ICON_PATH } from "../../game-config";
import ItemIcon from "../database/item-icon";
import EventFragmentDungeons from "./event-fragment-dungeons";
import EventGuideItemLink from "./event-guide-item-link";
import type { EventMapTarget } from "./event-schedule";
import type { EventGuideCatalog } from "./use-event-guide";

type CandyColor = EventGuideCatalog["candy"]["keys"][number]["color"];

const StepHeading = ({ number, title }: { number: string; title: string }) => <div className="mb-3 flex items-center gap-2.5">
  <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-accent/35 text-[11px] font-semibold text-accent">{number}</span>
  <h4 className="text-sm font-semibold text-white">{title}</h4>
</div>;

const CandyItem = ({ id, guide, quantity }: { id: string; guide: EventGuideCatalog; quantity?: number }) => {
  const { i18n } = useTranslation();
  const item = guide.items[id];
  if (!item) return null;
  const name = getItemDisplayName(item.name);
  return <span className="flex min-w-0 items-center gap-2.5">
    <ItemIcon icon={item.icon} name={name} size={34} />
    <span className="min-w-0 break-words text-[12px] font-medium leading-5 text-white">{name}</span>
    {quantity !== undefined && <strong className="shrink-0 text-[12px] tabular-nums text-accent">×{quantity.toLocaleString(i18n.language)}</strong>}
  </span>;
};

export default function EventCandyGuide({ guide, onShowMap }: {
  guide: EventGuideCatalog; onShowMap: (target: EventMapTarget) => void;
}) {
  const { t } = useTranslation();
  const [selectedColor, setSelectedColor] = useState<CandyColor>("red");
  const selectedKey = guide.candy.keys.find((key) => key.color === selectedColor) ?? guide.candy.keys[0]!;
  const colorName = t(`events.guide.colors.${selectedKey.color}`);
  const keyName = getItemDisplayName(guide.items[selectedKey.keyItemId]?.name ?? "");
  const locations = guide.candy.locations.filter((location) => location.color === selectedKey.color);

  return <div>
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{t("events.guide.colorsLabel")}</p>
    <div className="grid gap-2 @min-[440px]:grid-cols-3" role="group" aria-label={t("events.guide.colorsLabel")}>
      {guide.candy.keys.map((key) => <button key={key.color} type="button" onClick={() => setSelectedColor(key.color)} aria-pressed={selectedColor === key.color}
        className={cn("flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", selectedColor === key.color ? "border-accent/65 bg-accent-soft" : "border-border hover:border-accent/40 hover:bg-surface-hover")}>
        <ItemIcon icon={guide.items[key.keyItemId]?.icon} name={guide.items[key.keyItemId]?.name ?? ""} size={32} />
        <span className={cn("min-w-0 text-[12px] font-semibold", selectedColor === key.color ? "text-white" : "text-zinc-200")}>{t(`events.guide.colorShort.${key.color}`)}</span>
      </button>)}
    </div>

    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface/40 p-4">
      <StepHeading number="01" title={t("events.guide.fragmentStep")} />
      <p className="text-xs leading-5 text-zinc-200">{t("events.guide.fragmentSource")}</p>
      <div className="mt-4"><EventFragmentDungeons /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <CandyItem id={guide.candy.fragmentItemId} guide={guide} />
        <p className="text-[11px] leading-5 text-zinc-300">{t("events.guide.fragmentMapNote")}</p>
      </div>
    </div>

    <div className="mt-3 min-w-0 rounded-[var(--radius-md)] border border-border bg-surface/40 p-4">
      <StepHeading number="02" title={t("events.guide.craftStep")} />
      <p className="text-xs leading-5 text-zinc-200">{t("events.guide.keyCost", { count: selectedKey.fragmentCost })}</p>
      <div className="mt-4 flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-black/20 px-3 py-2.5">
        <CandyItem id={guide.candy.fragmentItemId} guide={guide} quantity={selectedKey.fragmentCost} />
        <ArrowRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <CandyItem id={selectedKey.keyItemId} guide={guide} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-zinc-300">{t("events.guide.keyLimit")}</p>
    </div>

    <div className="mt-3 grid gap-3 @min-[840px]:grid-cols-2">
      <div className="min-w-0 rounded-[var(--radius-md)] border border-border bg-surface/40 p-4 @min-[840px]:row-span-2 @min-[840px]:grid @min-[840px]:grid-rows-subgrid">
        <div>
          <StepHeading number="03" title={t("events.guide.candyLocations", { color: colorName })} />
          <p className="mb-3 text-xs leading-5 text-zinc-200 @min-[840px]:mb-0">{t("events.guide.candyLocationsIntro", { key: keyName })}</p>
        </div>
        <div className="grid gap-2">{locations.map((location) => <button key={location.markerId} type="button" onClick={() => onShowMap(location)}
          aria-label={t("events.guide.mapTownAction", { color: colorName, town: location.region })}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-black/20 px-3 py-2 text-left transition-colors hover:border-accent/55 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
          <ItemIcon icon={EVENT_CANDY_ICON_PATH} name={colorName} size={28} />
          <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-white">{location.region}</span><span className="block text-[11px] text-zinc-300">{location.faction}</span></span>
          <MapPin size={15} className="shrink-0 text-accent" aria-hidden="true" />
        </button>)}</div>
      </div>

      <div className="min-w-0 rounded-[var(--radius-md)] border border-border bg-surface/40 p-4 @min-[840px]:row-span-2 @min-[840px]:grid @min-[840px]:grid-rows-subgrid">
        <div>
          <StepHeading number="04" title={t("events.guide.candyRewards")} />
          <p className="mb-3 text-xs leading-5 text-zinc-200 @min-[840px]:mb-0">{t("events.guide.candyRewardsIntro", { color: colorName })}</p>
        </div>
        <div className="grid gap-2">{selectedKey.rewards.map((reward) => <EventGuideItemLink key={reward.itemId} id={reward.itemId} quantity={reward.quantity} guide={guide} compact />)}</div>
      </div>
    </div>
  </div>;
}
