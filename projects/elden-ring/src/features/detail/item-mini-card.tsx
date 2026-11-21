import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import ItemIcon from "../../components/item-icon";
import { categoryMap } from "../../data/categories";
import type { Game, ItemRef } from "../../data/types";
import { localizeDropNote } from "./drop-note";

interface ItemMiniCardProps {
  item: ItemRef;
  game: Game;
  /** Drill into this item's detail (unique group:id key). */
  onSelect?: (itemKey: string) => void;
}

/**
 * One row in a drops / shop / contents list. Shared so every list of items
 * looks identical (spec Section 9.1 — drops, shop_items and contents all
 * resolve to the same item identity). Shows the item's real extracted icon
 * when present, falling back to the category glyph.
 */
const ItemMiniCard = ({ item, game, onSelect }: ItemMiniCardProps) => {
  const { t, i18n } = useTranslation();
  const def = categoryMap(game).get(item.category);
  const color = def?.color ?? "#a1a1aa";
  const clickable = onSelect && item.itemKey != null;

  const body = (
    <>
      {item.iconId != null ? (
        <ItemIcon iconId={item.iconId} category={item.category} color={color} glyph={def?.icon ?? "pin"} size={26} />
      ) : (
        <CategoryDot color={color} icon={def?.icon ?? "pin"} size={22} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-100">
          {item.name}
          {item.qty ? <span className="ml-1 text-zinc-500">×{item.qty}</span> : null}
        </p>
        {item.note && (
          <p className="truncate text-[11px] text-muted">{localizeDropNote(item.note, t, i18n.language)}</p>
        )}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onSelect!(item.itemKey!)}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-white/[0.06] cursor-pointer"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2">
      {body}
    </div>
  );
};

export default ItemMiniCard;
