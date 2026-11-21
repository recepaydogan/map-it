import { ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../../../components/item-icon";
import { erCategoryColor, erItemKey } from "../../../data/er-items-data";
import { cn } from "../../../lib/cn";
import type { RecommendedItem } from "./types";

interface LoadoutSectionProps {
  title: string;
  icon: LucideIcon;
  items: RecommendedItem[];
  onSelect: (itemKey: string) => void;
  open?: boolean;
  accent?: boolean;
}

const LoadoutSection = ({ title, icon: Icon, items, onSelect, open, accent }: LoadoutSectionProps) => {
  const { t } = useTranslation();
  const reasons = items.map(({ reason, detail }) => detail ?? t(`detail.buildAdvisor.reason.${reason}`));
  /* A reason that is identical for every item in the section (all armour is
     "Efficient defense for this fight") tells the reader nothing and, truncated to
     "Efficient defense f…" four times over, only steals the line the name needs.
     Drop it there and let the name take both lines; keep it where it varies. */
  const showReasons = new Set(reasons).size > 1;
  if (!items.length) return null;
  return (
    <details open={open} className="group overflow-hidden rounded-[var(--radius-md)] border border-border bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <Icon size={14} className={accent ? "text-accent" : "text-zinc-500"} aria-hidden="true" />
        <span className="flex-1 text-[11.5px] font-semibold text-zinc-200">{title}</span>
        <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] tabular-nums text-zinc-500">{items.length}</span>
        <ChevronDown size={13} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid grid-cols-2 gap-1.5 border-t border-border p-2">
        {items.map(({ item }, index) => (
          <button
            key={erItemKey(item)}
            type="button"
            onClick={() => onSelect(erItemKey(item))}
            className="group/item flex min-w-0 items-center gap-2 rounded-[9px] border border-transparent bg-black/20 p-2 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] cursor-pointer"
          >
            <ItemIcon
              iconId={item.icon_id}
              category={item.category}
              color={erCategoryColor[item.category] ?? "#a1a1aa"}
              glyph={item.category === "armor" ? "fort" : item.category === "talisman" ? "talisman" : item.category === "ash-of-war" ? "ash-of-war" : "cookbook"}
              size={31}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[10.5px] font-medium leading-[1.25] text-zinc-200",
                  showReasons ? "truncate" : "line-clamp-2",
                )}
              >
                {item.name}
              </span>
              {showReasons && <span className="mt-0.5 block truncate text-[9.5px] text-subtle">{reasons[index]}</span>}
            </span>
            <ArrowRight
              size={12}
              className="shrink-0 text-zinc-500 transition-colors group-hover/item:text-accent"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </details>
  );
};

export default LoadoutSection;
