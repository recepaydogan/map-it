import { getItemDisplayName } from "../../lib/item-display-name";
import { ChevronLeft, LayoutGrid, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown, { type CategoryOption } from "../../components/category-dropdown";
import { getItemCategoryGroup, ITEM_CATEGORY_LABEL_KEYS, ITEM_CATEGORY_GROUPS, ITEM_GRADE_ORDER, type ItemCategoryGroup } from "../../game-config";
import { cn } from "../../lib/cn";
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

const DatabasePage = ({ initialItemId, initialRecipeId, initialItemTab, onOpenMap, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { initialItemId?: string | null; initialRecipeId?: string; initialItemTab?: "acquisition"; onOpenMap?: (mapId: string, markerId: string) => void }) => {
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
  const [grade, setGrade] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId ?? null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [mobileDetail, setMobileDetail] = useState(Boolean(initialItemId));
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const items = useMemo(() => catalog?.items.filter((item) => !item.duplicateOf && !item.hiddenFromList), [catalog]);
  const groupCounts = useMemo(() => {
    const counts = new Map<ItemCategoryGroup, number>();
    for (const item of items ?? []) {
      const key = getItemCategoryGroup(item.category);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const groupItems = useMemo(() => {
    if (group) return (items ?? []).filter((item) => getItemCategoryGroup(item.category) === group);
    const weapons: DatabaseItem[] = [];
    const others: DatabaseItem[] = [];
    for (const item of items ?? []) {
      (getItemCategoryGroup(item.category) === "weapons" ? weapons : others).push(item);
    }
    return [...weapons, ...others];
  }, [items, group]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of groupItems) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return counts;
  }, [groupItems]);
  const categories = [...categoryCounts.keys()].sort();
  const typeItems = useMemo(() => groupItems.filter((item) => !category || item.category === category), [groupItems, category]);
  const groupOptions: CategoryOption[] = [
    { key: "", label: t("database.allItems"), icon: LayoutGrid, count: items?.length ?? 0 },
    ...GROUPS.filter((key) => (groupCounts.get(key) ?? 0) > 0)
      .map((key) => ({ key, label: t(`database.groups.${key}`), count: groupCounts.get(key) ?? 0 })),
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
    ...grades.map((key) => ({ key, label: t(`database.clientItem.quality.${key.toLowerCase()}`, { defaultValue: gameText(key) }), count: gradeCounts.get(key) ?? 0 })),
  ];
  const categoryOptions: CategoryOption[] = [
    { key: "", label: t("database.allTypes"), count: groupItems.length },
    ...categories.map((key) => ({ key, label: t(ITEM_CATEGORY_LABEL_KEYS[key] ?? key, { defaultValue: gameText(key) }), count: categoryCounts.get(key) ?? 0 })),
  ];
  const itemsById = useMemo(() => new Map(catalog?.items.map((item) => [item.id, item]) ?? []), [catalog]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return typeItems.filter((item) =>
      (!grade || item.grade === grade) &&
      (skillData.status !== "ready" || matchesSkillRoll(skillData.data, item.id, skillClass, skillId)) &&
      (!normalized || `${item.name} ${gameText(item.name)}`.toLocaleLowerCase().includes(normalized)),
    );
  }, [typeItems, grade, query, skillData, skillClass, skillId, gameText]);
  const requested = itemsById.get(selectedId ?? "");
  const selected = requested?.duplicateOf ? itemsById.get(requested.duplicateOf) : requested;
  const current = selected && (selected.hiddenFromList || filtered.includes(selected))
    ? selected : filtered[0];
  useEffect(() => {
    if (current) onCurrentChange?.({ category: "items", id: current.id, name: current.name });
  }, [current, onCurrentChange]);
  const visibleItems = filtered.slice(0, limit);
  if (current && !current.hiddenFromList && !visibleItems.includes(current)) {
    if (!group && getItemCategoryGroup(current.category) !== "weapons") visibleItems.push(current);
    else visibleItems.unshift(current);
  }

  const selectItem = (item: DatabaseItem) => {
    setSelectedId(item.id);
    setMobileDetail(true);
    if (group && getItemCategoryGroup(item.category) !== group) {
      setGroup(getItemCategoryGroup(item.category));
      setCategory("");
    } else if (category && item.category !== category) setCategory("");
    if (grade && item.grade !== grade) setGrade("");
    if (query && !`${item.name} ${gameText(item.name)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {catalogState.status === "loading" && <p className="p-6 text-sm text-zinc-400">{t("database.loading")}</p>}
      {catalogState.status === "error" && <p className="p-6 text-sm text-danger-text" role="alert">{t("database.error")}</p>}
      {catalog && (
        <div className="flex min-h-0 flex-1">
          <aside className={cn("min-h-0 flex-col border-r border-border max-md:w-full md:w-[calc(18rem*var(--app-font-scale))] md:shrink-0", mobileDetail ? "hidden md:flex" : "flex")}>
            <div data-tour="reference-items" className="space-y-2 border-b border-border p-2.5">
              <CategoryDropdown
                ariaLabel={t("database.group")}
                value={group}
                options={groupOptions}
                dividerAfter=""
                onChange={(key) => { setGroup(key as ItemCategoryGroup | ""); setCategory(""); setGrade(""); setSelectedId(null); setLimit(PAGE_SIZE); }}
              />
              <CategoryDropdown
                ariaLabel={t("database.grade")}
                value={grade}
                options={gradeOptions}
                dividerAfter=""
                onChange={(key) => { setGrade(key); setSelectedId(null); setLimit(PAGE_SIZE); }}
              />
              {group && <CategoryDropdown
                ariaLabel={t("database.category")}
                value={category}
                options={categoryOptions}
                dividerAfter=""
                onChange={(key) => { setCategory(key); setGrade(""); setSelectedId(null); setLimit(PAGE_SIZE); }}
              />}
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent">
                <Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder={t("database.search")} aria-label={t("database.search")} className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-500" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label={t("database.clearSearch")} className="cursor-pointer text-zinc-400 hover:text-white"><X size={14} /></button>}
              </div>
              {skillData.status === "ready" && Object.values(skillData.data.pools).some((pool) => pool.length > 0)
                && <SkillRollControls data={skillData.data} characterClass={skillClass} skill={skillId} onChange={(c, s) => { setSkillClass(c); setSkillId(s); setLimit(PAGE_SIZE); }} />}
              {skillData.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
              <p className="px-1 text-[11px] text-zinc-500">{t("database.itemCount", { count: filtered.length.toLocaleString(i18n.language) })}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {visibleItems.map((item) => (
                <button type="button" key={item.id} onClick={() => selectItem(item)} aria-current={current?.id === item.id ? "true" : undefined} className={cn("group flex w-full cursor-pointer items-center gap-2.5 border-b border-border/60 px-2.5 py-2 text-left transition-colors", current?.id === item.id ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.04]")}>
                  <ItemIcon icon={item.icon} name={getItemDisplayName(gameText(item.name))} size={32} />
                  <span className="min-w-0 flex-1"><span className={cn("block truncate text-[13px] font-medium transition-colors", current?.id === item.id ? "text-white" : "text-zinc-200 group-hover:text-white")}>{getItemDisplayName(gameText(item.name))}</span><span className="block truncate text-[11px] text-muted">{t(ITEM_CATEGORY_LABEL_KEYS[item.category] ?? item.category, { defaultValue: gameText(item.category) })}{item.variant && ` · ${gameText(item.variant)}`}{item.itemLevel !== undefined && item.itemLevel > 0 && ` · ${t("database.itemLevel", { level: item.itemLevel })}`}</span></span>
                </button>
              ))}
              {filtered.length > limit && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="w-full cursor-pointer px-3 py-3 text-left text-[12px] text-accent hover:underline">{t("database.showMore")}</button>}
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-zinc-500">{items?.length ? t("database.noMatches") : t("database.noData")}</p>}
            </div>
          </aside>
          <section className={cn("min-h-0 min-w-0 flex-1", mobileDetail ? "flex flex-col" : "hidden md:flex md:flex-col")}>
            {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className="flex cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300 md:hidden"><ChevronLeft size={16} />{t("database.allItems")}</button>}
            <div className="flex min-h-0 flex-1 flex-col">{current ? <ItemDetail key={current.id} item={current} initialRecipeId={current.id === initialItemId ? initialRecipeId : undefined} initialTab={current.id === initialItemId ? initialItemTab : undefined} recipes={catalog.recipes} itemsById={itemsById} onSelect={(item) => openReference({ category: "items", id: item.id, name: item.name })} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} /> : <div className="grid h-full place-items-center p-6 text-center text-sm text-zinc-500">{items?.length ? t("database.noMatches") : t("database.noData")}</div>}</div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DatabasePage;
