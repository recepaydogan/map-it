import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { LevelRangeInput } from "../../components/level-range-filter";
import { CatalogCategory, CatalogLevelFilter, CatalogRow, CatalogSearch, CatalogTable, CatalogWorkspace } from "../../components/catalog-workspace";
import { useGameText } from "../../i18n/game-text";
import { useGameNames } from "../../i18n/use-game-names";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceBackLink from "../reference/reference-back-link";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import { SpellConnections, SpellPartOf } from "./spell-connections";
import { getSpellDescription } from "./spell-description";
import { SPELL_CLASSES, SPELL_CLASS_IDS, loadSpellEffectNames, type SpellEffectNames, type SpellIndexRow, useSpellDetail, useSpellIndex } from "./spell-data";
import SpellEffectsTable from "./spell-effects-table";
import SpellIcon from "./spell-icon";
import { getSpellFamilyKey, getSpellLearnLevel, getVisibleSpellRows, type SpellSortOrder } from "./spell-list";
import { useLocalizedSpellText } from "./spell-locales";
import SpellWriteupPanel from "./spell-writeup-panel";
import { useSpellOwners, useSpellWriteup } from "./spell-writeups";

const PAGE_SIZE = 60;
const CLASS_IDS = Object.keys(SPELL_CLASSES).map(Number);

const SpellBrowser = ({ target, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const { raceName, specializationName } = useGameNames();
  const localizedSpellText = useLocalizedSpellText();
  const openReference = useReferenceNavigation();
  const { rows, error } = useSpellIndex();
  const localizedSpellNames = useMemo(() => new Map(rows?.map((row) =>
    [row[0], gameText(row[1], `SpellName:${row[0]}:0`)] as const) ?? []), [rows, gameText]);
  const spellName = useCallback((row: SpellIndexRow) =>
    localizedSpellNames.get(row[0]) ?? row[1], [localizedSpellNames]);
  const rankName = (rank: string, id?: number) => {
    const nativeRank = id === undefined ? undefined : localizedSpellText(id)?.r;
    if (nativeRank) return nativeRank;
    const match = /^Rank (\d+)$/.exec(rank);
    return match ? t("spells.rank", { rank: Number(match[1]) }) : rank;
  };
  const owners = useSpellOwners();
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [selectedSortOrder, setSortOrder] = useState<SpellSortOrder | null>(null);
  const [levelRange, setLevelRange] = useState<LevelRangeInput>(["", ""]);
  const [minLevelInput, maxLevelInput] = levelRange;
  const [selectedClassId, setSelectedClassId] = useState<number | null>(SPELL_CLASS_IDS[target.group ?? ""] ?? null);
  const [query, setQuery] = useState(target.id ? target.name ?? "" : "");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<number | null>(Number(target.id) || null);
  const [showDetail, setShowDetail] = useState(Boolean(target.id));
  const [specialization, setSpecialization] = useState("");
  const byId = useMemo(() => new Map(rows?.map((row) => [row[0], row]) ?? []), [rows]);
  const byFamily = useMemo(() => {
    const families = new Map<string, SpellIndexRow[]>();
    for (const row of rows ?? []) {
      const key = getSpellFamilyKey(row);
      const family = families.get(key);
      if (family) family.push(row);
      else families.set(key, [row]);
    }
    return families;
  }, [rows]);
  const mode = showAllRecords || (target.id && !byId.get(Number(target.id))?.[4]) ? "all" : "player";
  const classId = selectedClassId ?? (byId.get(Number(target.id))?.[4] || owners?.get(Number(target.id))?.classId || 0);
  const specializations = useMemo(() => {
    const names = new Set<string>();
    if (classId && owners) for (const owner of owners.values()) if (owner.classId === classId && owner.talentTree) names.add(owner.talentTree);
    return [...names];
  }, [owners, classId]);
  const sortOrder = selectedSortOrder ?? (mode === "player" ? "level-asc" : "name");
  const minLevel = minLevelInput === "" ? undefined : Number(minLevelInput);
  const maxLevel = maxLevelInput === "" ? undefined : Number(maxLevelInput);
  const hasLevelRange = minLevel !== undefined || maxLevel !== undefined;
  const filtered = useMemo(() => getVisibleSpellRows(rows ?? [], { mode, classId, query, sortOrder, owners, minLevel, maxLevel, specialization, displayName: spellName }),
    [rows, mode, classId, query, sortOrder, owners, minLevel, maxLevel, specialization, spellName]);
  const globalQueryMatch = Boolean(!hasLevelRange && filtered.length === 0 && query.trim() && rows?.some((row) => spellName(row).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    || row[1].toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    || row[2].toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || String(row[0]).includes(query.trim())));
  const activeId = selectedId ?? filtered[0]?.[0] ?? null;
  const selected = activeId ? byId.get(activeId) : undefined;
  const activeFamily = selected ? getSpellFamilyKey(selected) : undefined;
  const { detail, error: detailError } = useSpellDetail(activeId);
  const translatedDetail = activeId === null ? undefined : localizedSpellText(activeId);
  const description = getSpellDescription(translatedDetail?.d ?? detail?.d,
    translatedDetail?.a ?? detail?.a);
  const { owner, writeup } = useSpellWriteup(activeId);
  const [effectNames, setEffectNames] = useState<SpellEffectNames | null>(null);
  useEffect(() => {
    let active = true;
    void loadSpellEffectNames().then((value) => { if (active) setEffectNames(value); }).catch(() => { /* Numeric effect IDs remain visible. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (selected) onCurrentChange?.({ category: "spells", id: String(selected[0]), name: spellName(selected) });
  }, [selected, onCurrentChange, spellName]);

  const changeLevel = (value: LevelRangeInput) => {
    setLevelRange(value);
    setShowDetail(false);
    setLimit(PAGE_SIZE);
    setSelectedId(null);
  };
  const choose = (row: SpellIndexRow) => { setSelectedId(row[0]); setShowDetail(true); };
  const ranks = (owner?.ranks ?? (activeFamily ? byFamily.get(activeFamily)?.map((row) => ({ id: row[0], name: row[2] || row[1], level: undefined })) ?? [] : [])).filter((rank) => byId.has(rank.id));
  const className = owner?.className || (selected ? SPELL_CLASSES[selected[4]] : undefined);
  const formatTime = (ms: number) => {
    if (ms < 0) return "∞";
    const seconds = ms / 1000;
    const value = Number((seconds < 60 ? seconds : seconds / 60).toFixed(1)).toLocaleString(i18n.language);
    return t(seconds < 60 ? "spells.mapPanel.seconds" : "spells.mapPanel.minutes", { value });
  };

  const spellDetail = <section className="@container scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="w-full">
        {!selected ? <div className="px-4 py-6 @min-[800px]:px-6"><ReferenceBackLink label={backLabel} onBack={onBack} /><p className="text-left text-[12px] text-subtle">{t("spells.selectSpell")}</p></div> : <>
          <header className="border-b border-border bg-surface/30 px-4 py-5 @min-[800px]:px-6">
          <ReferenceBackLink label={backLabel} onBack={onBack} />
          <div className="ml-0 mr-auto flex max-w-[808px] items-center gap-4"><SpellIcon id={selected[3]} name={spellName(selected)} size={60} /><div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              {className ? <button type="button" onClick={() => openReference({ category: "classes", id: className.toLowerCase(), name: gameText(className, `ChrClasses:${classId}:0`) })} className="cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-accent">{gameText(className, `ChrClasses:${classId}:0`)}</button> : <span>{(!/^rank\b/i.test(selected[2]) ? selected[2] : "") || t("spells.otherRecord")}</span>}
              {selected[5] ? <span className="rounded-[var(--radius-sm)] border border-accent/30 px-1.5 py-0.5">{t("spells.new")}</span> : null}
              {detail?.old && detail.old !== detail.d ? <span className="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-zinc-300">{t("spells.changed")}</span> : null}
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold text-white @min-[550px]:text-2xl">{spellName(selected)}</h2><p className="mt-0.5 text-[12px] text-subtle">{selected[2] ? rankName(selected[2], selected[0]) : t("spells.noRank")} · ID {selected[0].toLocaleString(i18n.language)}</p>
          </div></div>
          </header>
          <div className="ml-0 mr-auto max-w-[808px] space-y-7 px-4 py-6 @min-[800px]:px-6">
          {!detail && <p className="text-[12px] text-subtle" role={detailError ? "alert" : "status"}>{t(detailError ? "spells.detailError" : "reference.loading")}</p>}
          {detail && <>
            <div className="border-b border-border pb-5">
              <div className="grid gap-x-8 gap-y-1.5 text-[12px] @min-[590px]:grid-cols-2">
                {detail.sc && <p><span className="text-subtle">{t("spells.school")}</span> <span className="ml-1 font-medium text-zinc-100">{gameText(detail.sc)}</span></p>}
                <p><span className="text-subtle">{t("spells.cast")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.pa ? t("spells.passive") : detail.ct ? formatTime(detail.ct) : t("spells.instant")}</span></p>
                {owner?.talentTree ? <p><span className="text-subtle">{t("spells.talent")}</span> <span className="ml-1 font-medium text-zinc-100">{specializationName(className?.toLowerCase() ?? "", owner.talentTree)} · {t("spells.tier", { tier: owner.talentTier })} · {t("spells.fromLevel", { level: owner.talentLevel })}</span></p>
                  : detail.lv !== undefined && <p><span className="text-subtle">{t("spells.level")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.lv}</span></p>}
                {detail.cd !== undefined && detail.cd > 0 && <p><span className="text-subtle">{t("spells.cooldown")}</span> <span className="ml-1 font-medium text-zinc-100">{formatTime(detail.cd)}</span></p>}
                {detail.du !== undefined && detail.du !== 0 && <p><span className="text-subtle">{t("spells.duration")}</span> <span className="ml-1 font-medium text-zinc-100">{formatTime(detail.du)}</span></p>}
                {detail.rg && <p><span className="text-subtle">{t("spells.range")}</span> <span className="ml-1 font-medium text-zinc-100">{t("spells.mapPanel.yards", { value: `${detail.rg[0] ? `${detail.rg[0].toLocaleString(i18n.language)}–` : ""}${detail.rg[1].toLocaleString(i18n.language)}` })}</span></p>}
                {detail.co?.map(([amount, resource, percent], index) => <p key={index}><span className="text-subtle">{t("spells.cost")}</span> <span className="ml-1 font-medium text-zinc-100">{percent ? `${amount.toLocaleString(i18n.language)}% ${t("spells.ofBase")} ${gameText(resource)}` : `${amount.toLocaleString(i18n.language)} ${gameText(resource)}`}</span></p>)}
                {detail.dt && <p><span className="text-subtle">{t("spells.dispelType")}</span> <span className="ml-1 font-medium text-zinc-100">{gameText(detail.dt)}</span></p>}
                {detail.mc && <p><span className="text-subtle">{t("spells.mechanic")}</span> <span className="ml-1 font-medium text-zinc-100">{gameText(detail.mc)}</span></p>}
                {detail.pc && <p><span className="text-subtle">{t("spells.procChance")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.pc}%</span></p>}
                {detail.sp && <p><span className="text-subtle">{t("spells.spellPowerCoefficient")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.sp}{detail.osp !== undefined && <span className="ml-1 text-subtle">· {t("spells.classicEra")} {detail.osp}</span>}</span></p>}
                {owner?.classLine && <p><span className="text-subtle">{t("spells.classLine")}</span> <span className="ml-1 font-medium text-zinc-100">{specializationName(className?.toLowerCase() ?? "", owner.classLine)}</span></p>}
                {owner?.races?.length ? <p><span className="text-subtle">{t("spells.races")}</span> <span className="ml-1 font-medium text-zinc-100">{owner.races.map((race) => raceName(race.toLowerCase().replace(/\s+/g, ""), race)).join(", ")}</span></p> : null}
                {owner?.faction && <p><span className="text-subtle">{t("spells.faction")}</span> <span className="ml-1 font-medium text-zinc-100">{t(`map.affiliations.${owner.faction.toLowerCase()}`, { defaultValue: owner.faction })}</span></p>}
              </div>
              {description && <p className="select-text mt-4 border-t border-border pt-3 text-[13px] leading-6 text-zinc-100">{description}</p>}
              {detail.unavailableInSnapshot && <p className="mt-3 text-xs leading-5 text-subtle">{t("spells.unavailableInSnapshot")}</p>}
              {detail.retired && <p className="mt-3 text-xs leading-5 text-subtle">{t("spells.retired")}</p>}
              {owner?.source && owner.source !== "trainer" && <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-subtle">{t(owner.source === "sod" ? "spells.sources.sod" : "spells.sources.other")}</p>}
              {owner?.rune === "promoted" && <p className="mt-2 text-[11px] leading-5 text-subtle">{t("spells.sources.promoted")}</p>}
              {ranks.length > 1 && <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-medium text-subtle">{t("spells.ranks", { count: ranks.length })}</p>
                <div className="flex flex-wrap gap-1.5">{ranks.map((rank) =>
                  <button key={rank.id} type="button" onClick={() => setSelectedId(rank.id)} aria-current={activeId === rank.id ? "true" : undefined} className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent", activeId === rank.id ? "border-accent bg-surface-hover text-white" : "border-border bg-surface text-zinc-300 hover:text-white")}><span className="block font-medium">{rankName(rank.name, rank.id)}</span>{rank.level && <span className="block text-[10px] text-subtle">{t("spells.fromLevel", { level: rank.level })}</span>}</button>)}</div>
                {owner?.talentTree && <p className="mt-2 text-[11px] leading-5 text-subtle">{t("spells.talentRankNote")}</p>}
              </div>}
            </div>
            <SpellWriteupPanel detail={detail} currentDescription={translatedDetail?.d}
              oldDescription={translatedDetail?.old} writeup={writeup}
              classId={owner?.classId ?? 0} rows={rows ?? []} />
            {(detail.ef?.length || detail.of || detail.tr?.length || detail.tb?.length) && <section aria-label={t("spells.effects")}>
              <DatabaseSectionTitle>{t("spells.effects")}</DatabaseSectionTitle>
              <div className="space-y-2">
                <SpellPartOf detail={detail} byId={byId} />
                <SpellEffectsTable detail={detail} names={effectNames} byId={byId} />
                <SpellConnections detail={detail} byId={byId} />
              </div>
            </section>}
          </>}
          </div>
        </>}
      </div>
    </section>;

  const resetList = () => { setSelectedId(null); setLimit(PAGE_SIZE); setShowDetail(false); };
  const changeClass = (id: number) => { setSelectedClassId(id); setSpecialization(""); resetList(); };
  const label = t("spells.title");
  return <CatalogWorkspace label={label} categoryLabel={t("spells.classFilter")} detail={showDetail ? spellDetail : undefined}
    backLabel={t("spells.backToList")} onCloseDetail={() => setShowDetail(false)}
    categories={<>
      <h2 className="catalog-category-heading">{t("spells.classFilter")}</h2>
      <CatalogCategory active={classId === 0} onClick={() => changeClass(0)}>{t("spells.allClasses")}</CatalogCategory>
      {CLASS_IDS.map((id) => <div key={id}>
        <CatalogCategory active={classId === id && !specialization} onClick={() => changeClass(id)}
          expanded={classId === id && specializations.length > 0 ? true : undefined}>
          <span className="flex-1">{gameText(SPELL_CLASSES[id], 'ChrClasses:' + id + ':0')}</span>
          {classId === id && specializations.length > 0 && <ChevronDown size={13} className="shrink-0" aria-hidden="true" />}
        </CatalogCategory>
        {classId === id && specializations.length > 0 && <div className="catalog-subcategories">{specializations.map((name) => <CatalogCategory key={name}
          nested active={specialization === name} onClick={() => { setSpecialization(name); resetList(); }}>{specializationName(SPELL_CLASSES[id].toLowerCase(), name)}</CatalogCategory>)}</div>}
      </div>)}
    </>}
    toolbar={<>
      {!showDetail && <ReferenceBackLink label={backLabel} onBack={onBack} />}
      <CatalogSearch label={t("spells.search")} value={query} onChange={(value) => { setQuery(value); resetList(); }} />
      <CategoryDropdown neutral value={sortOrder} onChange={(value) => { setSortOrder(value as SpellSortOrder); resetList(); }}
        ariaLabel={t("spells.sortBy")} triggerClassName="w-auto min-h-[38px] max-w-full" options={(["level-asc", "level-desc", "name"] as const).map((key) => ({ key, label: t("spells.sortOptions." + key) }))} />
      <CatalogLevelFilter value={levelRange} onChange={changeLevel} />
    </>}>
    {!rows ? <p className="catalog-empty" role={error ? "alert" : "status"}>{t(error ? "spells.loadError" : "reference.loading")}</p> : <>
      <CatalogTable label={label} columns={[
        { label: t("catalog.spell") }, { label: t("catalog.rank"), width: "27%", compact: true },
        { label: t("catalog.learnLevel"), width: "22%", align: "end" },
      ]}>
        {filtered.slice(0, limit).map((row) => {
          const familyKey = getSpellFamilyKey(row);
          const ranksInFamily = byFamily.get(familyKey)?.length ?? 1;
          const level = getSpellLearnLevel(row[0], owners);
          const rank = ranksInFamily > 1 ? t("spells.ranks", { count: ranksInFamily }) : (row[2] && rankName(row[2], row[0])) || t("spells.noRank");
          return <CatalogRow key={row[0]} title={spellName(row)} icon={<SpellIcon id={row[3]} name={spellName(row)} size={30} />}
            selected={selectedId !== null && activeFamily === familyKey} onOpen={() => choose(row)}
            badge={row[5] ? <span className="ml-1 text-[10px] text-accent">{t("spells.new")}</span> : undefined}
            description={<><span className="catalog-narrow-only">{rank}</span>{classId === 0 && SPELL_CLASSES[row[4]] && <span className="block">{gameText(SPELL_CLASSES[row[4]], 'ChrClasses:' + row[4] + ':0')}</span>}</>}>
            <td className="catalog-wide-column">{rank}</td>
            <td className="catalog-number">{level === undefined ? "—" : owners?.get(row[0])?.talentTree ? level + "+" : level}</td>
          </CatalogRow>;
        })}
      </CatalogTable>
      {!filtered.length && <div className="catalog-empty"><p>{t("database.noMatches")}</p>{globalQueryMatch && (mode !== "all" || classId !== 0) &&
        <button type="button" onClick={() => { setShowAllRecords(true); changeClass(0); }} className="mt-2 cursor-pointer font-semibold text-accent hover:underline">{t("spells.searchAllRecords")}</button>}</div>}
      {limit < filtered.length && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="catalog-more">{t("spells.showMore", { count: Math.min(PAGE_SIZE, filtered.length - limit) })}</button>}
    </>}
  </CatalogWorkspace>;
};

export default SpellBrowser;
