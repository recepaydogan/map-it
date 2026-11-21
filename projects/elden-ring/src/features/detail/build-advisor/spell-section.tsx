import { ArrowRight, ChevronDown, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../../../components/item-icon";
import { erCategoryColor, erItemKey } from "../../../data/er-items-data";
import type { SpellRecommendation } from "./types";

interface SpellSectionProps {
  spells: SpellRecommendation[];
  onSelect: (itemKey: string) => void;
  open?: boolean;
}

const SpellSection = ({ spells, onSelect, open = false }: SpellSectionProps) => {
  const { t } = useTranslation();
  if (!spells.length) return null;
  return (
    <details open={open} className="group overflow-hidden rounded-[var(--radius-md)] border border-border bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <WandSparkles size={14} className="text-zinc-500" aria-hidden="true" />
        <span className="flex-1 text-[11.5px] font-semibold text-zinc-200">{t("detail.buildAdvisor.spells")}</span>
        <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] tabular-nums text-zinc-500">{spells.length}</span>
        <ChevronDown size={13} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-1.5 border-t border-border p-2">
        {spells.map((spell) => (
          <button
            key={erItemKey(spell.item)}
            type="button"
            onClick={() => onSelect(erItemKey(spell.item))}
            className="group/item flex w-full items-center gap-2 rounded-[9px] border border-transparent bg-black/20 p-2 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] cursor-pointer"
          >
            <ItemIcon
              iconId={spell.item.icon_id}
              category={spell.item.category}
              color={erCategoryColor[spell.item.category]}
              glyph={spell.item.category}
              size={34}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] font-medium text-zinc-200">{spell.item.name}</span>
              <span className="mt-0.5 block truncate text-[9.5px] text-subtle">{spell.catalyst.name}</span>
            </span>
            <span className="text-right">
              <span className="block text-[10px] font-bold tabular-nums text-accent">{spell.damage}</span>
              <span className="block text-[9px] tabular-nums text-subtle">{spell.fp} FP</span>
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

export default SpellSection;
