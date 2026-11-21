import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ALL_ITEM_CATEGORIES } from "./item-category-select";
import ItemDatabaseDetail from "./item-database-detail";
import ItemIcon from "./item-icon";
import { getItemCategory, ITEM_CATEGORIES } from "./item-category-config";
import { formatItemGroup } from "./item-group";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { createItemSearchDocuments, searchItemDocuments } from "./item-search";
import type { MapLocationNavigationTarget } from "../map/map-location-navigation";
import { useItemDatabase } from "./use-item-database";

const RENDER_CAP = 300;

const ItemDatabasePage = ({
  onNavigateMapLocation,
}: {
  onNavigateMapLocation: (target: MapLocationNavigationTarget) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { data, error, loading } = useItemDatabase();
  const [category, setCategory] = useState(ALL_ITEM_CATEGORIES);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(
    data?.categories.map((entry) => [entry.id, entry.count]) ?? [],
  ), [data]);
  const searchDocuments = useMemo(() => createItemSearchDocuments(
    (data?.items ?? []).filter((item) => category === ALL_ITEM_CATEGORIES || item.category === category),
    i18n.language,
  ), [category, data, i18n.language]);
  const filtered = useMemo(
    () => searchItemDocuments(searchDocuments, query, i18n.language),
    [i18n.language, query, searchDocuments],
  );
  const shown = filtered.slice(0, RENDER_CAP);
  const selected = data?.items.find((item) => item.id === selectedId);
  const categories = [
    { id: ALL_ITEM_CATEGORIES, label: t("items.allItems"), count: data?.items.length ?? 0 },
    ...ITEM_CATEGORIES.map(({ id, labelKey }) => ({ id, label: t(labelKey), count: counts[id] ?? 0 })),
  ].filter(({ count }) => count > 0);
  const categoryArtwork = useMemo(() => {
    const preferred: Record<string, string> = {
      weapons: "Longsword", shields: "Shield", armor: "Plate Armour", accessories: "Amulet",
      potions: "Potion of Healing", scrolls: "Scroll of Fireball", ammunition: "Arrow of Fire",
      throwables: "Alchemist's Fire", consumables: "Apple", alchemy: "Mugwort", books: "Book",
      keys: "Key", "quest-items": "Mysterious Artefact", miscellaneous: "Gem",
    };
    const byCategory = new Map<string, NonNullable<typeof data>["items"][number]>();
    for (const item of data?.items ?? []) {
      if (!item.icon?.atlas) continue;
      const current = byCategory.get(item.category);
      const desired = preferred[item.category]?.toLowerCase();
      if (!current || (desired && item.name.toLowerCase() === desired)) byCategory.set(item.category, item);
    }
    return byCategory;
  }, [data]);
  const selectCategory = (id: string) => { setCategory(id); setSelectedId(null); };

  if (loading || !data) return <p className="p-6 text-sm text-muted" role={error ? "alert" : "status"}>
    {t(error ? "items.errorTitle" : "items.loading")}
  </p>;

  return <ItemCatalog
    label={t("items.title")} gameName="Baldur’s Gate 3" artwork="/item-catalog-art.webp" wordmark="/item-catalog-logo.webp"
    search={{ query, label: t("items.searchPlaceholder"), clearLabel: t("items.clearSearch"),
      onChange: (value) => { setQuery(value); setSelectedId(null); } }}
    categoryLabel={t("items.categoryLabel")}
    landingCategories={categories.map(({ id, label }) => {
      const representative = categoryArtwork.get(id);
      return { id, label, onSelect: () => selectCategory(id),
        icon: representative && <ItemIcon item={representative} size={52} /> };
    })}
    categories={categories.map(({ id, label, count }) => <ItemCatalogCategory key={id} label={label}
      count={count.toLocaleString(i18n.language)} active={category === id} onSelect={() => selectCategory(id)} />)}
    columns={[{ label: t("items.categoryLabel") }]}
    rows={shown.map((item) => {
      const type = formatItemGroup(item) ?? t(getItemCategory(item.category).labelKey);
      return { id: item.id, label: item.localizedNames[i18n.language] ?? item.name,
        icon: <ItemIcon item={item} size={30} className="shrink-0 rounded-sm border border-border" />,
        subtitle: type, cells: [type] };
    })}
    onOpen={setSelectedId} onBack={() => setSelectedId(null)} backLabel={t("items.allItems")}
    detail={selected && <ItemDatabaseDetail key={selected.id} item={selected}
      onNavigateMapLocation={onNavigateMapLocation}
      onSelectRelatedItem={(id) => {
        if (!filtered.some((item) => item.id === id)) { setCategory(ALL_ITEM_CATEGORIES); setQuery(""); }
        setSelectedId(id);
      }} />}
    emptyMessage={t("items.noResults")}
    afterRows={filtered.length > RENDER_CAP && t("items.renderCap", { shown: RENDER_CAP, total: filtered.length })}
  />;
};

export default ItemDatabasePage;
