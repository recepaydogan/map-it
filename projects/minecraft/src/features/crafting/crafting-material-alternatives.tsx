import { ChevronDown, Package } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import MapPointIcon from "../map/map-point-icon";

export default function CraftingMaterialAlternatives({ itemIds }: { itemIds: readonly string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  if (!itemIds.length) return null;

  return <div className="mt-1.5">
    <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}
      className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] py-1 text-[11px] font-semibold text-subtle transition-colors hover:text-white">
      {t("crafting.alternatives", { count: itemIds.length })}
      <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180 text-accent")} aria-hidden="true" />
    </button>
    {open && <ul id={contentId} className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
      {itemIds.map(id => { const item = gameKnowledgeSubjectDisplay("item", id); return <li key={id}
        className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center text-accent">
          <MapPointIcon source={item.image} fallback={Package} size={25} />
        </span>
        <span className="min-w-0 truncate text-[11px] font-medium text-zinc-100">{item.name}</span>
      </li>; })}
    </ul>}
  </div>;
}
