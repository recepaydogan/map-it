import { getItemDisplayName } from "../../lib/item-display-name";
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import ItemIcon from "../database/item-icon";
import CreatureIcon from "./creature-icon";
import ReferenceDetail from "./reference-detail";
import type { MapReferenceSearch } from "../map/map-focus-request";
import TravelFilters from "./travel-filters";
import { matchesTravelFilters, travelGroupKey, type TravelFilterValue } from "./travel-presentation";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex, useIntelligenceData } from "./use-reference-data";
import type { TitleData } from "../intelligence/intelligence-types";
import TitleFilters, { type TitleFilter } from "../intelligence/title-filters";
import { useChecklist } from "../intelligence/use-checklist";
import { TITLE_ICON } from "../../game-config";

const ReferenceBrowser = ({ target, onOpenMap, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceIndex();
  const titleData = useIntelligenceData<TitleData>("titles", target.category === "titles");
  const [titleFilter, setTitleFilter] = useState<TitleFilter>({ faction: "", stat: "", missing: false });
  const ownedTitles = useChecklist("titles");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [bossRegion, setBossRegion] = useState("");
  const [bossTiming, setBossTiming] = useState("");
  const [travelFilters, setTravelFilters] = useState<TravelFilterValue>({ region: "", faction: "" });
  const [selected, setSelected] = useState(target.id);
  const [limit, setLimit] = useState(100);
  const [includeUnnamed, setIncludeUnnamed] = useState(Boolean(target.id));
  const resetResults = () => { setSelected(""); setLimit(100); };
  const entries = useMemo(() => state.status === "ready" ? state.data.entries.filter((entry) => entry.category === target.category && (!target.group || entry.group === target.group)) : [], [state, target.category, target.group]);
  const groups = useMemo(() => { const counts = new Map<string, number>(); for (const entry of entries) if (entry.group) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1); return [...counts].sort(([a], [b]) => a.localeCompare(b)); }, [entries]);
  const filtered = useMemo(() => entries.filter((entry) => (target.category === "travel" || includeUnnamed || !entry.unnamed) && (!group || entry.group === group) && (target.category !== "travel" || matchesTravelFilters(entry, travelFilters)) && (!bossTiming || entry.worldBoss?.some(record => bossTiming === "scheduled" ? Boolean(record.schedule) : !record.schedule)) && (!bossRegion || entry.worldBoss?.some((record) => record.region === bossRegion)) && (!query || `${entry.worldBoss?.map((record) => record.region).join(" ") ?? ""} ${getItemDisplayName(entry.name)} ${gameText(entry.name)} ${entry.subtitle ?? ""} ${entry.travel?.destinationName ?? ""} ${entry.travel?.regions.join(" ") ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [entries, gameText, group, query, includeUnnamed, target.category, travelFilters, bossRegion, bossTiming]);
  const titleFiltered = target.category === "titles" && titleData.status === "ready" ? filtered.filter(entry => {
    const title = titleData.data.entries[entry.id];
    return title && (!titleFilter.faction || title.faction === titleFilter.faction)
      && (!titleFilter.stat || title.passive.some(s => s.key === titleFilter.stat)) && (!titleFilter.missing || !ownedTitles.ids.has(entry.id));
  }) : filtered;
  const current = entries.find((entry) => entry.id === selected);
  useEffect(() => {
    if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name, ...(target.group ? { group: target.group } : {}) });
  }, [current, onCurrentChange, target.group]);

  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const boss = target.group === "Boss";
  const isTitle = target.category === "titles";
  const isTravel = target.category === "travel";
  const groupLabel = (key: string) => isTravel ? t(travelGroupKey(key) ?? key) : gameText(key);
  const selectGroup = (key: string) => { setGroup(key); resetResults(); };
  const regions = boss ? [...new Set(entries.flatMap((entry) => entry.worldBoss?.map((record) => record.region) ?? []))].sort() : [];
  const toolbar = <>
    {boss && <>
      <CategoryDropdown ariaLabel={t("reference.boss.region")} value={bossRegion} onChange={(value) => { setBossRegion(value); resetResults(); }}
        options={[{ key: "", label: t("reference.boss.allRegions") }, ...regions.map((region) => ({ key: region, label: gameText(region) }))]} />
      <CategoryDropdown ariaLabel={t("reference.boss.spawnFilter")} value={bossTiming} onChange={(value) => { setBossTiming(value); resetResults(); }}
        options={[{ key: "", label: t("reference.boss.allTypes"), count: entries.filter((entry) => entry.worldBoss?.length).length },
          ...["scheduled", "field"].map((key) => ({
            key, label: t(key === "scheduled" ? "reference.boss.scheduledType" : "reference.boss.fieldType"),
            count: entries.filter((entry) => entry.worldBoss?.some((record) => key === "scheduled" ? Boolean(record.schedule) : !record.schedule)).length,
          }))]} />
    </>}
    {isTravel && <TravelFilters entries={entries} value={travelFilters} onChange={(value) => { setTravelFilters(value); resetResults(); }} />}
    {isTitle && titleData.status === "ready" && <TitleFilters data={titleData.data} filter={titleFilter} onChange={(value) => { setTitleFilter(value); resetResults(); }} />}
    {isTitle && titleData.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {!isTravel && entries.some((entry) => entry.unnamed) &&
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={includeUnnamed} onChange={(event) => { setIncludeUnnamed(event.target.checked); resetResults(); }} className="accent-accent" />
        {t("reference.includeUnnamed")}
      </label>}
  </>;

  return <ItemCatalog
    label={t(boss ? "reference.categories.world-bosses" : `reference.categories.${target.category}`)}
    search={{ query, label: t("reference.search"), clearLabel: t("database.clearSearch"), onChange: (value) => { setQuery(value); resetResults(); } }}
    toolbar={<>
      {toolbar}
      <span role="status" className="catalog-result-count">{t("reference.entryCount", { count: titleFiltered.length.toLocaleString(i18n.language) })}</span>
    </>}
    categories={!target.group && groups.length > 0 && <>
      <ItemCatalogCategory label={t("reference.allGroups")} count={entries.length.toLocaleString(i18n.language)} active={!group} onSelect={() => selectGroup("")} />
      {groups.map(([key, count]) => <ItemCatalogCategory key={key} label={groupLabel(key)} count={count.toLocaleString(i18n.language)}
        active={group === key} onSelect={() => selectGroup(key)} />)}
    </>}
    columns={boss ? [{ label: t("reference.boss.region") }] : [{ label: t("reference.group") }, { label: t("reference.detailsTab") }]}
    rows={titleFiltered.slice(0, limit).map((entry) => {
      const label = getItemDisplayName(entry.name, gameText(entry.name));
      const category = entry.group ? groupLabel(entry.group) : "";
      const subtitle = entry.travel ? t(`reference.travel.types.${entry.travel.kind}`)
        : entry.worldBoss?.map((record) => gameText(record.region)).join(" · ") ?? (entry.subtitle && gameText(entry.subtitle));
      const iconPath = isTitle ? TITLE_ICON : entry.icon;
      const icon = entry.category === "creatures" ? <CreatureIcon icon={entry.icon} name="" size={30} />
        : iconPath ? <ItemIcon icon={iconPath} name={label} size={30} />
          : <BookOpen size={17} className="text-accent/60" aria-hidden="true" />;
      return { id: entry.id, label, icon, subtitle: subtitle || category, cells: boss ? [subtitle] : [category, subtitle] };
    })}
    onOpen={setSelected}
    onBack={() => setSelected("")}
    backLabel={t("reference.backToList")}
    detail={current && <ReferenceDetail key={current.id} summary={current} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} />}
    emptyMessage={t("database.noMatches")}
    afterRows={titleFiltered.length > limit && <button type="button" onClick={() => setLimit((value) => value + 100)}>
      {t("reference.showMore", { count: titleFiltered.length - limit })}
    </button>}
  />;
};

export default ReferenceBrowser;
