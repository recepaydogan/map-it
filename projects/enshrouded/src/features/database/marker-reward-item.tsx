import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import { sameReferenceTarget, useSelectedReference } from "../reference/reference-navigation-context";
import ItemIcon from "./item-icon";

const MarkerRewardItem = ({ item, chance, quantity, detail, onOpenItem }: {
  item: { id: string; name: string; icon?: string };
  chance?: ReactNode;
  quantity?: number | string;
  detail?: ReactNode;
  onOpenItem?: (id: string) => void;
}) => {
  const selectedReference = useSelectedReference();
  const active = sameReferenceTarget(selectedReference, { category: "items", id: item.id });
  return <button type="button" disabled={!onOpenItem} onClick={() => onOpenItem?.(item.id)}
  aria-pressed={onOpenItem && selectedReference !== undefined ? active : undefined}
  className={cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1 py-2 text-left transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default", active && "bg-accent-soft ring-1 ring-inset ring-accent/60")}>
  <ItemIcon icon={item.icon} name={getItemDisplayName(item.name)} size={28} />
  <span className="min-w-0 flex-1">
    <span className="flex items-baseline gap-1.5 text-[12px] font-medium leading-4 text-zinc-100">
      <span className="min-w-0 break-words">{getItemDisplayName(item.name)}</span>
      {quantity !== undefined && <span className="shrink-0 text-[11px] font-normal tabular-nums text-subtle">×{quantity}</span>}
    </span>
    {detail}
  </span>
  {chance && <span className="shrink-0 text-[12px] tabular-nums text-zinc-200">{chance}</span>}
  {onOpenItem && <ChevronRight size={13} className="shrink-0 text-subtle" aria-hidden="true" />}
</button>;
};

export default MarkerRewardItem;
