import { useRewardOrder } from "../database/use-reward-order";
import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import ProgressiveList from "../../components/progressive-list";
import { ChevronRight, MapPin, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import CreatureIcon from "./creature-icon";
import { getItemRewardQuantity } from "../database/item-reward-quantity";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import ReferenceRewardRates from "./reference-reward-rates";
import type { ReferenceLink, ReferenceTarget } from "./reference-types";

/** Navigation rows, never an embedded tree of reference records. */
const AdventureLinkList = ({ links, tone = "item", dungeonId, showRates = false, showRateNotes = false, initialCount, variants, onShowMap, mapLinkIds }: {
  links: ReferenceLink[];
  tone?: "boss" | "creature" | "item";
  dungeonId?: string;
  showRates?: boolean;
  showRateNotes?: boolean;
  initialCount?: number;
  variants?: Map<string, ReferenceLink[]>;
  onShowMap?: (link: ReferenceLink) => void;
  mapLinkIds?: Set<string>;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const displayName = (link: ReferenceLink) => gameText(getItemDisplayName(link.name),
    `${tone === "item" ? "ItemSparse" : "Creature"}:${link.id}:${tone === "item" ? 4 : 0}`);
  const open = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const orderRewards = useRewardOrder();
  return <ProgressiveList initialCount={initialCount} className="space-y-1.5">{(tone === "item" ? orderRewards(links) : links).map((link, index) => {
    const target: ReferenceTarget = { ...link,
      dungeonId, creatureVariants: variants?.get(link.name) };
    const creatureIcons = tone === "creature" ? variants?.get(link.name)?.filter((variant) => variant.icon).slice(0, 2) : undefined;
    const icon = link.icon ?? creatureIcons?.[0]?.icon;
    const rewardQuantity = showRates && link.rewardRates?.length ? getItemRewardQuantity(link) : undefined;
    const active = sameReferenceTarget(selectedReference, target);
    const hasMapAction = !!onShowMap && !!mapLinkIds?.has(link.id);
    const row = <button type="button" onClick={() => open(target)}
      aria-pressed={selectedReference !== undefined ? active : undefined}
      className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
        active ? "border-accent/60 bg-accent-soft" : tone === "boss" ? "border-danger/35 bg-danger/10 hover:bg-danger/20" : "border-border bg-white/[0.025] hover:border-accent/40 hover:bg-accent-soft",
        hasMapAction && "rounded-b-none border-b-0 pb-1")}>
      {creatureIcons && creatureIcons.length > 1
        ? <span className="flex shrink-0 -space-x-2">{creatureIcons.map((variant) =>
          <CreatureIcon key={variant.id} icon={variant.icon} name={displayName(variant)} size={32} />)}</span>
        : tone !== "item"
          ? <CreatureIcon icon={icon} name={displayName(link)} size={32} />
          : icon
            ? <ItemIcon icon={icon} name={displayName(link)} size={32} />
            : <Package size={18} className="shrink-0 text-subtle" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        {tone === "boss" && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-danger-text">{t("reference.guide.bossDetails")}</span>}
        <span className="block text-[13px] font-medium leading-snug text-zinc-100">{displayName(link)}{tone === "creature" && link.quantity && link.quantity > 1 && <span className="ml-1.5 text-xs font-normal tabular-nums text-subtle">×{link.quantity.toLocaleString(i18n.language)}</span>}{rewardQuantity !== undefined && <span className="ml-1.5 text-xs font-normal tabular-nums text-subtle">×{typeof rewardQuantity === "number" ? rewardQuantity.toLocaleString(i18n.language) : rewardQuantity}</span>}</span>
        {link.note && (!showRates || showRateNotes) && <span className="mt-0.5 block text-xs text-subtle">{link.note}</span>}
      </span>
      {tone !== "creature" && link.quantity !== undefined && !(showRates && link.rewardRates?.length) && <span className="text-xs tabular-nums text-subtle">×{link.quantity.toLocaleString(i18n.language)}</span>}
      {showRates && !!link.rewardRates?.length && <ReferenceRewardRates rates={link.rewardRates} compact />}
      <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>;
    return hasMapAction ? <div key={`${link.id}-${index}`}>
      {row}
      <button type="button" onClick={() => onShowMap(link)}
        className={cn("flex w-full cursor-pointer items-center gap-1.5 rounded-b-[var(--radius-md)] border border-t-0 px-3 pb-2.5 pl-14 text-left text-[11px] font-medium text-accent transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-accent",
          active ? "border-accent/60 bg-accent-soft" : "border-danger/35 bg-danger/10 hover:bg-danger/20")}
      ><MapPin size={13} aria-hidden="true" />{t("events.showOnMap")}</button>
    </div> : <div key={`${link.id}-${index}`}>{row}</div>;
  })}</ProgressiveList>;
};
export default AdventureLinkList;
