import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown, { type CategoryOption } from "../../components/category-dropdown";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { useDataVersion } from "../../data/localized-data";
import { ArchiveItemDetail, ArchiveItemIcon, archiveIconUrl } from "./nr-archive-item";
import { nightreignArchiveSections, rarityColor, RARITY_COLORS, STATUS_COLOR } from "./nr-archive-pages";

const PAGE_SIZE = 150;
export const NIGHTREIGN_CATALOG_ART = "/nightreign-catalog-art.webp";

const NrArchive = () => {
  const { t, i18n } = useTranslation();
  const dataVersion = useDataVersion((s) => s.version); // game text swaps with the language
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<number | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const sections = useMemo(() => {
    // The localized game tables are replaced when their version changes.
    return nightreignArchiveSections(t);
  }, [dataVersion, t]);

  const entries = useMemo(() => sections.flatMap(section => section.pages.map(page => ({
    page, category: section.id, label: section.label, icon: section.icon,
  }))), [sections]);
  const scopedEntries = useMemo(() => category === "all" ? entries
    : entries.filter(entry => entry.category === category), [entries, category]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return scopedEntries.filter(({ page }) =>
      (rarity === null || page.rarity === rarity) &&
      (type === null || page.type === type) &&
      (!needle || page.name.toLocaleLowerCase().includes(needle) ||
        (page.hay ?? "").toLocaleLowerCase().includes(needle)));
  }, [scopedEntries, query, rarity, type]);
  const shown = filtered.slice(0, limit);
  const selected = entries.find(({ page }) => page.key === selectedKey);

  const resetResults = () => { setLimit(PAGE_SIZE); setSelectedKey(null); };
  const selectCategory = (id: string) => {
    setCategory(id);
    setRarity(null);
    setType(null);
    resetResults();
  };
  const rarityLabel = (value: number) => t("nightreign.archiveRarityLevels." + value);
  const rarityCounts = new Map<number, number>();
  for (const { page } of scopedEntries) {
    if (page.rarity != null) rarityCounts.set(page.rarity, (rarityCounts.get(page.rarity) ?? 0) + 1);
  }
  const rarityOptions: CategoryOption[] = [
    { key: "all", label: t("nightreign.archiveAllRarities"), count: scopedEntries.length },
    ...RARITY_COLORS.flatMap((color, value) => {
      const count = rarityCounts.get(value);
      return count ? [{ key: String(value), label: rarityLabel(value), color, count }] : [];
    }),
  ];
  const types = category === "weapons" ? [...new Set(scopedEntries.flatMap(({ page }) => page.type ? [page.type] : []))]
    .sort((left, right) => left.localeCompare(right, i18n.language)) : [];
  const categories = [
    { id: "all", label: t("codex.allItems"), count: entries.length },
    ...sections.map(section => ({ id: section.id, label: section.label, count: section.pages.length })),
  ];

  return <ItemCatalog
    label={t("nav.nightreignItems")}
    gameName={t("game.nightreign")}
    artwork={NIGHTREIGN_CATALOG_ART}
    wordmark="/nightreign-catalog-logo.webp"
    search={{ query, label: t("nightreign.archiveSearch"), clearLabel: t("codex.clearSearch"),
      onChange: value => { setQuery(value); resetResults(); } }}
    landingCategories={[
      { id: "all", label: t("codex.allItems"), onSelect: () => selectCategory("all") },
      ...sections.map(section => ({
        id: section.id, label: section.label, onSelect: () => selectCategory(section.id),
        icon: <ArchiveItemIcon src={archiveIconUrl(section.pages.find(page => page.iconId != null)?.iconId)} fallback={section.icon}
          imgClass="size-[52px] object-contain" iconSize={34} />,
      })),
    ]}
    categories={categories.map(({ id, label, count }) => <ItemCatalogCategory key={id} label={label}
      active={category === id} count={count.toLocaleString(i18n.language)} onSelect={() => selectCategory(id)} />)}
    toolbar={<>
      {rarityCounts.size > 0 && <CategoryDropdown
        value={rarity === null ? "all" : String(rarity)}
        options={rarityOptions}
        onChange={key => { setRarity(key === "all" ? null : Number(key)); resetResults(); }}
        dividerAfter="all"
        ariaLabel={t("nightreign.archiveRarity")}
        className="w-auto min-h-[38px]"
      />}
      {types.length > 0 && <CategoryDropdown
        value={type ?? "all"}
        options={[{ key: "all", label: t("nightreign.archiveAllTypes") }, ...types.map(value => ({ key: value, label: value }))]}
        onChange={key => { setType(key === "all" ? null : key); resetResults(); }}
        dividerAfter="all"
        ariaLabel={t("nightreign.archiveType")}
        className="w-auto min-h-[38px]"
      />}
    </>}
    columns={[{ label: t("nightreign.archiveCategory") }, { label: t("nightreign.archiveRarity") }]}
    rows={shown.map(({ page, label, icon: fallback }) => {
      const typeLabel = page.type ? label + " · " + page.type : label;
      return {
        id: page.key,
        label: page.name,
        nameStyle: page.rarity == null ? undefined : { color: rarityColor(page.rarity) },
        subtitle: typeLabel,
        icon: <ArchiveItemIcon src={archiveIconUrl(page.iconId)} fallback={fallback} imgClass="size-[30px] object-contain" iconSize={17} />,
        cells: [
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="truncate">{typeLabel}</span>
            {page.dot && <span title={page.dot} role="img" aria-label={page.dot} className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[page.dot] ?? "currentColor" }} />}
          </span>,
          page.rarity != null && <span style={{ color: rarityColor(page.rarity) }}>{rarityLabel(page.rarity)}</span>,
        ],
      };
    })}
    onOpen={setSelectedKey}
    onBack={() => setSelectedKey(null)}
    backLabel={t("itemCatalog.backToList")}
    detail={selected && <ArchiveItemDetail key={selected.page.key} p={selected.page} fallback={selected.icon} />}
    emptyMessage={t("nightreign.archiveNoMatch")}
    afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit(current => current + PAGE_SIZE)}>
      {t("itemCatalog.loadMore")}
    </button>}
  />;
};

export default NrArchive;
