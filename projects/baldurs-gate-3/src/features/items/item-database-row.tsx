import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getItemCategory } from "./item-category-config";
import ItemIcon from "./item-icon";
import { formatItemGroup } from "./item-group";
import type { ItemDatabaseEntry } from "./types";

interface ItemDatabaseRowProps {
  item: ItemDatabaseEntry;
  active: boolean;
  onSelect: (item: ItemDatabaseEntry) => void;
}

const ItemDatabaseRow = ({ item, active, onSelect }: ItemDatabaseRowProps) => {
  const { t } = useTranslation();
  const category = getItemCategory(item.category);
  const group = formatItemGroup(item);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] py-2 pl-3 pr-2.5 text-left transition-colors",
        active ? "bg-accent-soft" : "hover:bg-white/[0.04]",
      )}
      style={active ? { boxShadow: "inset 2px 0 0 0 var(--color-accent)" } : undefined}
    >
      <ItemIcon
        item={item}
        size={32}
        className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-white/10 bg-black/25 text-accent"
      />
      <span className="min-w-0 flex-1">
        <span className={cn(
          "block truncate text-[13px] font-medium transition-colors",
          active ? "text-white" : "text-zinc-200 group-hover:text-white",
        )}>
          {item.name}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {group ?? t(category.labelKey)}
        </span>
      </span>
    </button>
  );
};

export default ItemDatabaseRow;
