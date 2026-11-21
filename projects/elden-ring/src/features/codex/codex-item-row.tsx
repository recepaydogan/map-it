import { useTranslation } from "react-i18next";
import ItemIcon from "../../components/item-icon";
import { ER_ITEM_CATEGORIES, erCategoryColor, type ErItem, erItemEnglishTextByKey, erItemKey } from "../../data/er-items-data";
import { cn } from "../../lib/cn";

const iconForCategory = (cat: string) =>
  ER_ITEM_CATEGORIES.find((c) => c.key === cat)?.icon ?? "pin";
const labelForCategory = (cat: string) =>
  ER_ITEM_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;

interface CodexItemRowProps {
  item: ErItem;
  active: boolean;
  onSelect: (item: ErItem) => void;
}

const CodexItemRow = ({ item, active, onSelect }: CodexItemRowProps) => {
  const { t } = useTranslation();
  // The bare "Head/Arms/Legs" (no-armor) pieces have subtype === name, which would print
  // the word twice — fall back to the category label for those. Both are ER taxonomy terms,
  // localized through the `term` namespace (English text keeps as its own fallback).
  const subtitle = item.subtype && item.subtype !== item.name ? item.subtype : labelForCategory(item.category);
  
  // SEO href MUST use the English name so bots follow identical URLs as the generated static sitemap
  const enName = erItemEnglishTextByKey(erItemKey(item))?.name ?? item.name;
  const slug = enName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const typeId = erItemKey(item).split(":")[1] || erItemKey(item);
  
  return (
    <a
      href={`/items/${item.category}/${slug}-${typeId}`}
      onClick={(e) => {
        // We only want the internal routing logic on click to avoid full page reload
        e.preventDefault();
        onSelect(item);
      }}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-md)] py-2 pl-3 pr-2.5 text-left transition-colors cursor-pointer",
        active ? "bg-accent-soft" : "hover:bg-white/[0.04]",
      )}
      // Selection edge — a thin accent rule that FOLLOWS the rounded corners (an inset shadow is
      // clipped to the border-radius, unlike a straight strip), so it reaches the rounded ends.
      style={active ? { boxShadow: "inset 2px 0 0 0 var(--color-accent)" } : undefined}
    >
      <ItemIcon
        iconId={item.icon_id}
        category={item.category}
        color={erCategoryColor[item.category] ?? "#a1a1aa"}
        glyph={iconForCategory(item.category)}
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium transition-colors",
            active ? "text-white" : "text-zinc-200 group-hover:text-white",
          )}
        >
          {item.name}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {t(`term.${subtitle}`, { defaultValue: subtitle })}
        </span>
      </span>
    </a>
  );
};

export default CodexItemRow;
