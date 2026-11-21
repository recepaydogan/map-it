import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { getItemDisplayName } from "../../lib/item-display-name";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown, { type CategoryOption } from "../../components/category-dropdown";
import { GAME_CONFIG, getItemCategoryGroup, ITEM_CATEGORY_LABEL_KEYS, ITEM_CATEGORY_GROUPS, ITEM_DATABASE_HIDDEN_CATEGORIES, ITEM_DATABASE_LAST_CATEGORIES, ITEM_GRADE_COLORS, ITEM_GRADE_ORDER, type ItemCategoryGroup } from "../../game-config";
import ItemDetail from "./item-detail";
import ItemIcon from "./item-icon";
import type { DatabaseItem } from "./item-database-types";
import { useItemCatalog } from "./use-item-catalog";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { SkillRollData } from "../intelligence/intelligence-types";
import { matchesSkillRoll } from "../intelligence/skill-rolls";
import SkillRollControls from "../intelligence/skill-roll-controls";

import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceNavigationProps } from "../reference/reference-types";

const PAGE_SIZE = 100;
const GROUPS: ItemCategoryGroup[] = [...(Object.keys(ITEM_CATEGORY_GROUPS) as ItemCategoryGroup[]), "other"];

const DatabasePage = ({ initialItemId, initialRecipeId, initialEnhancementLevel, onOpenMap, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { initialItemId?: string | null; initialRecipeId?: string; initialEnhancementLevel?: number; onOpenMap?: (mapId: string, markerId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const catalogState = useItemCatalog();
  const skillData = useIntelligenceData<SkillRollData>("skill-rolls");
  const [skillClass, setSkillClass] = useState("");
  const [skillId, setSkillId] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ItemCategoryGroup | "">("");
  const [category, setCategory] = useState("");
  const [groupCollapsed, setGroupCollapsed] = useState(false);
  const [grade, setGrade] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId ?? null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showDetail, setShowDetail] = useState(Boolean(initialItemId));
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const catalogItems = useMemo(() => catalog?.items.filter((item) => !ITEM_DATABASE_HIDDEN_CATEGORIES.has(item.category)), [catalog]);
  const items = useMemo(() => catalogItems?.filter((item) => !item.duplicateOf && !item.hiddenFromList)
    .sort((a, b) => Number(ITEM_DATABASE_LAST_CATEGORIES.has(a.category)) - Number(ITEM_DATABASE_LAST_CATEGORIES.has(b.category))), [catalogItems]);
  const groupStats = useMemo(() => {
    const stats = new Map<ItemCategoryGroup, { count: number; categories: Set<string> }>();
    for (const item of items ?? []) {
      const key = getItemCategoryGroup(item.category);
      const group = stats.get(key) ?? { count: 0, categories: new Set<string>() };
      group.count++;
      group.categories.add(item.category);
      stats.set(key, group);
    }
    return stats;
  }, [items]);
  const groupItems = useMemo(() => (items ?? []).filter((item) => !group || getItemCategoryGroup(item.category) === group), [items, group]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of groupItems) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return counts;
  }, [groupItems]);
  const categories = [...categoryCounts.keys()].sort();
  const typeItems = useMemo(() => groupItems.filter((item) => !category || item.category === category), [groupItems, category]);
  const groupOptions: (CategoryOption & { expandable?: boolean })[] = [
    { key: "", label: t("database.allItems"), count: items?.length ?? 0 },
    ...GROUPS.map((key) => ({
        key,
        label: t(`database.groups.${key}`),
        count: groupStats.get(key)?.count ?? 0,
        expandable: (groupStats.get(key)?.categories.size ?? 0) > 1,
      })),
  ];
  const gradeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of typeItems) counts.set(item.grade, (counts.get(item.grade) ?? 0) + 1);
    return counts;
  }, [typeItems]);
  const grades = [...gradeCounts.keys()].sort((a, b) => {
    const aIndex = ITEM_GRADE_ORDER.findIndex((value) => value === a);
    const bIndex = ITEM_GRADE_ORDER.findIndex((value) => value === b);
    return (aIndex < 0 ? ITEM_GRADE_ORDER.length : aIndex) - (bIndex < 0 ? ITEM_GRADE_ORDER.length : bIndex) || a.localeCompare(b);
  });
  const gradeOptions: CategoryOption[] = [
    { key: "", label: t("database.allGrades"), count: typeItems.length },
    ...grades.map((key) => ({ key, label: gameText(key), count: gradeCounts.get(key) ?? 0 })),
  ];
  const categoryOptions: CategoryOption[] = [
    ...categories.map((key) => ({ key, label: t(ITEM_CATEGORY_LABEL_KEYS[key] ?? key, { defaultValue: gameText(key) }), count: categoryCounts.get(key) ?? 0 })),
  ];
  const itemsById = useMemo(() => new Map(catalogItems?.map((item) => [item.id, item]) ?? []), [catalogItems]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return typeItems.filter((item) =>
      (!grade || item.grade === grade) &&
      (skillData.status !== "ready" || matchesSkillRoll(skillData.data, item.id, skillClass, skillId)) &&
      (!normalized || `${item.name} ${gameText(item.name, item.id)}`.toLocaleLowerCase().includes(normalized)),
    );
  }, [typeItems, grade, query, skillData, skillClass, skillId, gameText]);
  const requested = itemsById.get(selectedId ?? "");
  const selected = requested?.duplicateOf ? itemsById.get(requested.duplicateOf) : requested;
  const current = selected ?? filtered[0];
  useEffect(() => {
    if (showDetail && current) onCurrentChange?.({ category: "items", id: current.id, name: current.name });
  }, [showDetail, current, onCurrentChange]);
  const visibleItems = filtered.slice(0, limit);
  if (showDetail && current && !current.hiddenFromList && !visibleItems.includes(current)) {
    if (ITEM_DATABASE_LAST_CATEGORIES.has(current.category)) visibleItems.push(current);
    else visibleItems.unshift(current);
  }

  const selectItem = (item: DatabaseItem) => {
    setSelectedId(item.id);
    setShowDetail(true);
    if (group && getItemCategoryGroup(item.category) !== group) {
      setGroup(getItemCategoryGroup(item.category));
      setGroupCollapsed(false);
      setCategory("");
    } else if (category && item.category !== category) setCategory("");
    if (grade && item.grade !== grade) setGrade("");
    if (query && !`${item.name} ${gameText(item.name, item.id)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) setQuery("");
  };

  const resetResults = () => {
    setLimit(PAGE_SIZE);
    setShowDetail(false);
  };

  if (catalogState.status !== "ready" || !catalog) {
    return catalogState.status === "error"
      ? <p className="p-6 text-sm text-danger-text" role="alert">{t("database.error")}</p>
      : <p className="p-6 text-sm text-muted" role="status">{t("database.loading")}</p>;
  }

  const selectGroup = (key: string) => {
    setGroup(key as ItemCategoryGroup | "");
    setGroupCollapsed(false);
    setCategory("");
    setGrade("");
    resetResults();
  };

  const categoryIcons = new Map<string, DatabaseItem>();
  for (const item of items ?? []) {
    const key = getItemCategoryGroup(item.category);
    if (item.icon && !categoryIcons.has(key)) categoryIcons.set(key, item);
  }

  const rows = visibleItems.map((item) => {
    const name = getItemDisplayName(item.name, gameText(item.name, item.id));
    const categoryLabel = t(ITEM_CATEGORY_LABEL_KEYS[item.category] ?? item.category, { defaultValue: gameText(item.category) });
    return {
      id: item.id,
      label: name,
      nameClassName: ITEM_GRADE_COLORS[item.grade],
      icon: <ItemIcon icon={item.icon} name={name} size={30} />,
      subtitle: categoryLabel,
      cells: [categoryLabel, item.itemLevel && item.itemLevel > 0 ? item.itemLevel.toLocaleString(i18n.language) : "—"],
    };
  });

  return (
    <ItemCatalog
      label={t("reference.categories.items")}
      categoryLabel={t("database.category")}
      artwork="/item-catalog-art.webp"
      gameName={GAME_CONFIG.appName}
      search={{ query, label: t("database.search"), clearLabel: t("database.clearSearch"),
        onChange: (value) => { setQuery(value); resetResults(); } }}
      landingCategories={groupOptions.filter(({ key, count }) => !key || count).map(({ key, label, count }) => {
        const item = categoryIcons.get(key);
        return { id: key, label, count: count?.toLocaleString(i18n.language), onSelect: () => selectGroup(key),
          icon: item && <ItemIcon icon={item.icon} name="" size={52} /> };
      })}
      toolbar={
        <>
          <CategoryDropdown ariaLabel={t("database.grade")} triggerClassName="w-auto min-h-[38px]"
            value={grade} options={gradeOptions} dividerAfter=""
            onChange={(key) => { setGrade(key); resetResults(); }} />
          {skillData.status === "ready" && Object.values(skillData.data.pools).some((pool) => pool.length > 0) &&
            <SkillRollControls data={skillData.data} characterClass={skillClass} skill={skillId}
              onChange={(character, skill) => { setSkillClass(character); setSkillId(skill); resetResults(); }} />}
          {skillData.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
        </>
      }
      categories={groupOptions.filter(({ key, count }) => !key || count).map(({ key, label, count, expandable }) => {
        const expanded = group === key && !groupCollapsed;
        return (
          <div key={key}>
            <ItemCatalogCategory label={label} count={count?.toLocaleString(i18n.language)}
              active={group === key} expanded={expandable ? expanded : undefined}
              onSelect={() => {
                if (expandable && group === key) setGroupCollapsed(collapsed => !collapsed);
                else selectGroup(key);
              }} />
            {expandable && expanded && <div className="item-catalog-subcategories">
              {categoryOptions.map((option) => <ItemCatalogCategory key={option.key} label={option.label}
                count={option.count?.toLocaleString(i18n.language)} active={category === option.key}
                onSelect={() => { setCategory(category === option.key ? "" : option.key); setGrade(""); resetResults(); }} />)}
            </div>}
          </div>
        );
      })}
      columns={[{ label: t("database.category") }, { label: t("database.browserItemLevel"), numeric: true }]}
      rows={rows}
      onOpen={(id) => { const item = itemsById.get(id); if (item) selectItem(item); }}
      onBack={() => setShowDetail(false)}
      backLabel={t("database.allItems")}
      detail={showDetail && current ? (
        <ItemDetail key={current.id} item={current} initialRecipeId={current.id === initialItemId ? initialRecipeId : undefined}
          initialEnhancementLevel={current.id === initialItemId ? initialEnhancementLevel : undefined} recipes={catalog.recipes}
          itemsById={itemsById} onSelect={(item) => openReference({ category: "items", id: item.id, name: item.name })}
          onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} />
      ) : undefined}
      emptyMessage={items?.length ? t("database.noMatches") : t("database.noData")}
      afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t("database.showMore")}</button>}
    />
  );
};

export default DatabasePage;
