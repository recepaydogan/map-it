import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EVENT_GUIDE_UNLOCK_TARGETS } from "../../game-config";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import ItemIcon from "../database/item-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { EventGuideCatalog } from "./use-event-guide";

export default function EventGuideItemLink({ id, guide, quantity, compact = false }: {
  id: string; guide: EventGuideCatalog; quantity?: number; compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const openReference = useReferenceNavigation();
  const item = guide.items[id];
  if (!item) return null;
  const name = getItemDisplayName(item.name);
  const accessibleName = item.variant ? `${name} · ${item.variant}` : name;
  const unlock = EVENT_GUIDE_UNLOCK_TARGETS[id];
  return <button type="button" onClick={() => openReference(unlock
    ? { ...unlock, name: item.name } : { category: "items", id, name: item.name })}
    className={cn("flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-border text-left transition-colors hover:border-accent/55 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent", compact ? "px-2.5 py-2" : "px-3 py-3")}
    aria-label={quantity ? t("events.guide.itemQuantity", { name: accessibleName, quantity }) : accessibleName}>
    {item.icon && <ItemIcon icon={item.icon} name={accessibleName} size={compact ? 28 : 36} />}
    <span className="min-w-0 flex-1 break-words text-[12px] font-medium leading-5 text-zinc-100">{name}{item.variant && <span className="mt-0.5 block text-[10px] font-normal text-zinc-400">{item.variant}</span>}</span>
    {quantity !== undefined && <strong className="shrink-0 text-[12px] tabular-nums text-accent">×{quantity.toLocaleString(i18n.language)}</strong>}
    <ArrowUpRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
  </button>;
}
