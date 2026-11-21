import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import rawWikiCatalog from "../../../public/data/enshrouded/wiki-catalog.json";
import CategoryDropdown from "../../components/category-dropdown";
import { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { matchesContentSearch } from "../../i18n/content-search";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import { BUILDING_CATALOG } from "./building-catalog";
import BuildingGuidePage from "./building-guide-page";
import EnshroudedCatalog from "./enshrouded-catalog";
import WikiGuidePage from "./wiki-guide-page";
import { WIKI_CATALOGS, type WikiCatalog } from "./wiki-navigation";

type ItemCategory = "building" | WikiCatalog;
export type GuideItemTarget = { category: ItemCategory; id: string };

type ListedItem = GuideItemTarget & {
  key: string;
  name: string;
  group: string;
  buildingType?: string;
  image: string | null;
  searchTerms: (string | null | undefined)[];
};

const wikiRecords = (rawWikiCatalog as { records: {
  id: string; name: string; catalog: WikiCatalog; groups: string[]; section: string;
  icon: string | null; description: string | null; type: string | null;
}[] }).records;
const items: ListedItem[] = [
  ...BUILDING_CATALOG.records.map((record) => ({
    key: "building:" + record.sourcePage, id: record.sourcePage, name: record.name,
    category: "building" as const, group: record.group, buildingType: record.sourceCatalog,
    image: record.icon?.path ?? null,
    searchTerms: [record.set, record.type, record.description, record.group],
  })),
  ...wikiRecords.map((record) => ({
    key: record.catalog + ":" + record.id, id: record.id, name: record.name,
    category: record.catalog,
    group: record.catalog === "collectibles" ? record.section : record.groups[0] ?? record.section,
    image: record.icon,
    searchTerms: [record.description, record.type, record.section, ...record.groups],
  })),
];
const itemsByKey = new Map(items.map((item) => [item.key, item]));
const categories = (["building", ...WIKI_CATALOGS] as const).map((id) => {
  const records = items.filter((item) => item.category === id);
  return { id, records, representative: records.find((item) => item.image) };
});
const buildingTypes = [...new Set(BUILDING_CATALOG.records.map((record) => record.sourceCatalog))];
const PAGE_SIZE = 100;

export default function ItemsGuideCatalog({ selected, onSelectItem, onOpenMap }: {
  selected: GuideItemTarget | null;
  onSelectItem: (item: GuideItemTarget | null) => void;
  onOpenMap: (markerId?: string) => void;
}) {
  const contentText = useGameText();
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ItemCategory | "all">("all");
  const [group, setGroup] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [buildingType, setBuildingType] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categoryLabel = (id: ItemCategory) => id === "building"
    ? t("buildingGuide.nav") : t("wikiGuide.catalogs." + id);
  const groupLabel = (id: ItemCategory, value: string) => id === "building"
    ? t("buildingGuide.groups." + value, { defaultValue: contentText(value) })
    : t("wikiGuide.groups." + value.toLowerCase().replaceAll("/", "-"), {
      defaultValue: contentText(value.split("/").at(-1) ?? value),
    });
  const categoryItems = useMemo(() => {
    const records = categories.find((entry) => entry.id === category)?.records ?? items;
    return buildingType ? records.filter((item) => item.buildingType === buildingType) : records;
  }, [category, buildingType]);
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of categoryItems) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
    return counts;
  }, [categoryItems]);
  const filtered = useMemo(() => categoryItems.filter((item) =>
    (!group || group === item.group)
    && matchesContentSearch(query, [item.name, ...item.searchTerms], contentText)
  ), [categoryItems, group, query, contentText]);

  const resetResults = () => {
    setLimit(PAGE_SIZE);
    onSelectItem(null);
  };
  const selectCategory = (id: ItemCategory | "all") => {
    setCategory(id);
    setGroup("");
    setBuildingType("");
    setExpanded(id !== "all");
    resetResults();
  };

  return <EnshroudedCatalog
    label={t("itemsGuide.title")}
    search={{
      query, label: t("itemsGuide.search"), clearLabel: t("itemsGuide.clearSearch"),
      onChange: (value) => { setQuery(value); resetResults(); },
    }}
    landingCategories={[
      { id: "all", label: t("wikiGuide.allItems"), onSelect: () => selectCategory("all") },
      ...categories.map(({ id, representative }) => ({
        id, label: categoryLabel(id), onSelect: () => selectCategory(id),
        icon: representative?.image && <img src={contentUrl(representative.image)} alt="" width={52} height={52} />,
      })),
    ]}
    categories={<>
      <ItemCatalogCategory label={t("wikiGuide.allItems")} count={items.length.toLocaleString(i18n.language)}
        active={category === "all"} onSelect={() => selectCategory("all")} />
      {categories.map(({ id, records }) => {
        const active = category === id;
        const canExpand = active ? groupCounts.size > 1 : records.some((item) => item.group !== records[0]?.group);
        const open = active && expanded && canExpand;
        return <div key={id}>
          <ItemCatalogCategory label={categoryLabel(id)} count={records.length.toLocaleString(i18n.language)}
            active={active} expanded={canExpand ? open : undefined} onSelect={() => {
              if (active && canExpand) setExpanded((current) => !current);
              else selectCategory(id);
            }} />
          {open && <div className="item-catalog-subcategories">
            {[...groupCounts].map(([value, count]) => <ItemCatalogCategory key={value} label={groupLabel(id, value)}
              count={count.toLocaleString(i18n.language)} active={group === value}
              onSelect={() => { setGroup(group === value ? "" : value); resetResults(); }} />)}
          </div>}
        </div>;
      })}
    </>}
    toolbar={category === "building" && <CategoryDropdown ariaLabel={t("itemsGuide.buildingCatalogFilter")}
      triggerClassName="w-auto min-h-[38px]" value={buildingType}
      options={[{ key: "", label: t("itemsGuide.allBuildingCatalogs") }, ...buildingTypes.map((value) => ({
        key: value, label: t("buildingGuide.catalogs." + value.toLowerCase().replaceAll(" ", "-")),
      }))]}
      onChange={(value) => { setBuildingType(value); setGroup(""); resetResults(); }} />}
    columns={[{ label: t("itemCatalog.categories") }]}
    rows={filtered.slice(0, limit).map((item) => ({
      id: item.key, label: contentText(item.name),
      cells: [categoryLabel(item.category) + " · " + groupLabel(item.category, item.group)],
      icon: item.image && <img src={contentUrl(item.image)} alt="" width={30} height={30}
        loading="lazy" className="size-[30px] object-contain" />,
    }))}
    onOpen={(id) => { const item = itemsByKey.get(id); if (item) onSelectItem(item); }}
    onBack={() => onSelectItem(null)}
    backLabel={t("reference.backToList")}
    detail={selected && (selected.category === "building"
      ? <BuildingGuidePage key={selected.id} initialPage={selected.id} onOpenMap={onOpenMap} />
      : <WikiGuidePage key={selected.category + ":" + selected.id} catalog={selected.category} initialPage={selected.id} />)}
    emptyMessage={t("itemsGuide.noResults")}
    afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
      {t("reference.showMore", { count: filtered.length - limit })}
    </button>}
  />;
}
