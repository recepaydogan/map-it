import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { LevelRangeInput } from "../../components/level-range-filter";
import { CatalogLevelFilter, CatalogRow, CatalogSearch, CatalogTable, CatalogWorkspace } from "../../components/catalog-workspace";
import { cn } from "../../lib/cn";
import { useGameText } from "../../i18n/game-text";
import { getCategoryConfig } from "../map/map-config";
import MapPointIcon from "../map/map-point-icon";
import { adventureFamilies, adventureKind, adventureVariant } from "./adventure-presentation";
import ReferenceDetail from "./reference-detail";
import AdventureDetailWorkspace from "./adventure-detail-workspace";
import ReferenceListSidebar from "./reference-list-sidebar";
import ReferenceBackLink from "./reference-back-link";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";
import { dungeonLevelRange, dungeonSuggestedLevels } from "./dungeon-journal";
import { dungeonListFacts } from "./dungeon-list-facts";
import { useDungeonName } from "./use-dungeon-name";

const AdventureBrowser = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const dungeonName = useDungeonName();
  const isDungeon = target.category === "dungeons";
  const state = useReferenceIndex();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [faction, setFaction] = useState("");
  const [region, setRegion] = useState("");
  const [levelRange, setLevelRange] = useState<LevelRangeInput>(["", ""]);
  const [selected, setSelected] = useState(target.id);
  const [detail, setDetail] = useState(Boolean(target.id));
  const [limit, setLimit] = useState(80);
  const entries = useMemo(() => state.status === "ready" ? state.data.entries.filter((entry) =>
    entry.category === target.category && (entry.adventure?.listed || entry.id === target.id)) : [], [state, target.category, target.id]);
  const [minimum, maximum] = levelRange;
  const searchLabel = t(isDungeon ? "dungeonJournal.search" : "reference.search");
  const families = useMemo(() => adventureFamilies(entries.filter((entry) => {
    const data = entry.adventure;
    if (isDungeon && (minimum || maximum)) {
      const levels = dungeonSuggestedLevels[entry.id];
      const min = minimum ? Number(minimum) : 1;
      const max = maximum ? Number(maximum) : 60;
      if (!levels || min > max || levels[0]! > max || levels[1]! < min) return false;
    }
    const name = isDungeon ? `${entry.name} ${dungeonName(entry.name)}` : entry.name;
    const regionName = isDungeon ? dungeonListFacts(entry).region : data?.region;
    return (isDungeon || !kind || data?.kind === kind) && (!faction || data?.faction === faction || data?.faction === "All")
      && (isDungeon || !region || data?.region === region)
      && query.trim().toLocaleLowerCase().split(/\s+/).every((word) => `${name} ${regionName ?? ""} ${regionName ? gameText(regionName) : ""}`.toLocaleLowerCase().includes(word));
  })).sort((a, b) => isDungeon
    ? (dungeonSuggestedLevels[a.variants[0]!.id]?.[0] ?? Number.MAX_SAFE_INTEGER)
      - (dungeonSuggestedLevels[b.variants[0]!.id]?.[0] ?? Number.MAX_SAFE_INTEGER) : 0),
  [entries, kind, faction, region, query, isDungeon, minimum, maximum, dungeonName, gameText]);
  const family = families.find((item) => item.variants.some((entry) => entry.id === selected)) ?? families[0];
  const current = family?.variants.find((entry) => entry.id === selected) ?? family?.variants[0];
  const kinds = [...new Set(entries.map((entry) => entry.adventure?.kind).filter((key): key is string => Boolean(key)))];
  const regions = [...new Set(entries.map((entry) => entry.adventure?.region).filter((key): key is string => Boolean(key)))].sort();
  useEffect(() => { if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name }); }, [current, onCurrentChange]);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-6 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const visible = families.slice(0, limit);
  if (family && !visible.includes(family)) visible.unshift(family);
  const factionOptions = entries.some((entry) => entry.adventure?.faction && entry.adventure.faction !== "All")
    ? [{ key: "", label: t("reference.adventure.allFactions") }, ...["Light", "Dark"].map((key) => ({ key, label: t(`reference.adventure.factions.${key}`) }))] : null;
  const variants = family && family.variants.length > 1 && <div className="space-y-1 border-b border-border px-5 py-3">
    <p className="text-xs text-subtle">{t("reference.adventure.selectVariant")}</p>
    <CategoryDropdown neutral ariaLabel={t("reference.adventure.selectVariant")} value={current?.id ?? ""} onChange={setSelected}
      options={family.variants.map((entry, index) => {
        const label = adventureVariant(entry, t);
        const duplicate = family.variants.some((other) => other.id !== entry.id && adventureVariant(other, t) === label);
        return { key: entry.id, label: duplicate ? t("reference.adventure.numberedVariant", { label, number: index + 1 }) : label };
      })} />
  </div>;

  if (isDungeon) {
    const label = t("reference.categories.dungeons");
    const resetList = () => { setLimit(80); setSelected(""); setDetail(false); };
    return <CatalogWorkspace label={label} tour="reference-dungeons"
      onCloseDetail={() => setDetail(false)} detail={detail && current ? <>
        {variants}
        <div className="@container min-h-0 flex-1"><AdventureDetailWorkspace key={current.id} summary={current} onOpenMap={onOpenMap} {...navigation} /></div>
      </> : undefined}
      listBack={navigation.backLabel && navigation.onBack && <ReferenceBackLink label={navigation.backLabel} onBack={navigation.onBack} />}
      search={<CatalogSearch label={searchLabel} value={query} onChange={(value) => { setQuery(value); resetList(); }} />}
      filters={<>
        <CatalogLevelFilter value={levelRange} onChange={(value) => { setLevelRange(value); resetList(); }} />
        {factionOptions && <CategoryDropdown neutral ariaLabel={t("reference.labels.faction")} value={faction}
          onChange={(value) => { setFaction(value); resetList(); }} triggerClassName="w-auto min-h-[38px]" options={factionOptions} />}
      </>}>
      <CatalogTable label={label} columns={[
        { label: t("catalog.name") }, { label: t("reference.adventure.region"), width: "24%", compact: true },
        { label: t("spells.levelRange"), width: "22%", align: "end" }, { label: t("catalog.players"), width: "16%", align: "end" },
      ]}>
        {visible.map((item) => {
          const first = item.variants[0]!;
          const data = first.adventure;
          const facts = dungeonListFacts(first);
          const regionName = facts.region ? gameText(facts.region) : undefined;
          const icon = getCategoryConfig(data?.kind === "raid" ? "raid" : "dungeon");
          return <CatalogRow key={item.id} title={dungeonName(item.name)}
            icon={<span className="grid size-[30px] shrink-0 place-items-center">
              <MapPointIcon fallback={icon.icon} source={icon.nativeIconPath} size={30} />
            </span>}
            selected={Boolean(selected) && item.id === family?.id} onOpen={() => { setSelected(first.id); setDetail(true); }}
            description={<>{regionName && <span className="catalog-narrow-only">{regionName}</span>}
              {item.variants.length > 1 && <span className="block">{t("reference.adventure.variants", { count: item.variants.length })}</span>}</>}>
            <td className="catalog-wide-column">{regionName ?? "—"}</td>
            <td className="catalog-number">{dungeonLevelRange(first.id) ?? (data?.level ? `${data.level}+` : "—")}</td>
            <td className="catalog-number">{facts.groupSize ?? "—"}</td>
          </CatalogRow>;
        })}
      </CatalogTable>
      {!families.length && <p className="catalog-empty">{t("database.noMatches")}</p>}
      {families.length > limit && <button type="button" onClick={() => setLimit(limit + 80)} className="catalog-more">{t("reference.showMore", { count: families.length - limit })}</button>}
    </CatalogWorkspace>;
  }
  return <div className="@container flex min-h-0 min-w-0 flex-1 px-3 pb-3 pt-[18px]">
    <ReferenceListSidebar desktopWidth="@min-[768px]:w-80" mobileDetail={detail}>
      <div className="space-y-3 border-b border-border p-4">
        <div data-tour={target.category === "dungeons" ? "reference-dungeons" : undefined} className="@min-[768px]:pr-8"><h1 className="text-lg font-semibold text-zinc-100">{t(`reference.categories.${target.category}`)}</h1><p className="mt-1 text-xs leading-relaxed text-subtle">{t(`reference.adventure.${target.category}Intro`)}</p></div>
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 focus-within:border-accent">
          <Search size={15} aria-hidden="true" className="text-subtle" /><input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-subtle" value={query} aria-label={searchLabel} placeholder={searchLabel} onChange={(event) => { setQuery(event.target.value); setLimit(80); }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={t("database.clearSearch")} className="cursor-pointer text-subtle"><X size={14} /></button>}
        </div>
        {kinds.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.type")} value={kind} onChange={(value) => { setKind(value); setLimit(80); }} options={[{ key: "", label: t("reference.adventure.allTypes") }, ...kinds.map((key) => ({ key, label: t(`reference.adventure.kinds.${key}`) }))]} />}
        {factionOptions && <CategoryDropdown ariaLabel={t("reference.labels.faction")} value={faction} onChange={(value) => { setFaction(value); setLimit(80); }} options={factionOptions} />}
        {regions.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.region")} value={region} onChange={(value) => { setRegion(value); setLimit(80); }} options={[{ key: "", label: t("reference.adventure.allRegions") }, ...regions.map((key) => ({ key, label: key }))]} />}
        <p className="text-xs text-subtle" aria-live="polite">{t("reference.adventure.results", { count: families.length })}</p>
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
        {visible.map((item) => {
          const first = item.variants[0]!;
          const range = dungeonLevelRange(first.id);
          const levelLabel = range ? t("dungeonJournal.levelRange", { range })
            : first.adventure?.level ? t("reference.adventure.level", { number: first.adventure.level }) : "";
          return <button key={item.id} type="button" aria-current={item.id === family?.id ? "true" : undefined}
          onClick={() => { setSelected(item.variants[0]!.id); setDetail(true); }}
          className={cn("mb-1 w-full cursor-pointer rounded-[var(--radius-sm)] border px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent",
            item.id === family?.id ? "border-accent/40" : "border-transparent",
            item.id === family?.id ? "bg-surface-hover" : "hover:bg-surface-hover")}>
          <span className="block text-sm font-medium leading-snug text-zinc-100">{item.name}</span>
          <span className="mt-1 block text-xs text-subtle">{adventureKind(first, t)}{levelLabel && ` · ${levelLabel}`}</span>
          {item.variants[0]!.adventure?.faction !== "All" && <span className="mt-1 block text-xs text-subtle">{t(`reference.adventure.factions.${item.variants[0]!.adventure?.faction ?? "All"}`)}</span>}
          {item.variants.length > 1 && <span className="mt-1 block text-[11px] text-accent">{t("reference.adventure.variants", { count: item.variants.length })}</span>}
          </button>;
        })}
        {!families.length && <p className="p-4 text-sm text-subtle">{t("database.noMatches")}</p>}
        {families.length > limit && <button type="button" onClick={() => setLimit(limit + 80)} className="cursor-pointer p-3 text-sm text-accent">{t("reference.showMore", { count: families.length - limit })}</button>}
      </div>
    </ReferenceListSidebar>
    <section className={cn("min-w-0 flex-1 flex-col", detail ? "flex" : "hidden @min-[768px]:flex")}>
      <button type="button" onClick={() => setDetail(false)} className="flex cursor-pointer items-center gap-2 border-b border-border p-3 text-sm text-zinc-200 @min-[768px]:hidden"><ArrowLeft size={15} />{t("reference.backToList")}</button>
      {variants}
      <div className="min-h-0 flex-1">{current ? <ReferenceDetail key={current.id} summary={current} onOpenMap={onOpenMap} {...navigation} />
        : <p className="p-6 text-sm text-subtle">{t("database.noMatches")}</p>}</div>
    </section>
  </div>;
};

export default AdventureBrowser;
