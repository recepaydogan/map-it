import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import ForeverLabel from "../../components/forever-label";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceBackLink from "../reference/reference-back-link";
import ReferenceSidebarToggle from "../reference/reference-sidebar-toggle";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import { SpellConnections, SpellPartOf } from "./spell-connections";
import { getSpellDescription } from "./spell-description";
import { SPELL_CLASSES, SPELL_CLASS_IDS, loadSpellEffectNames, type SpellEffectNames, type SpellIndexRow, useSpellDetail, useSpellIndex } from "./spell-data";
import SpellEffectsTable from "./spell-effects-table";
import SpellIcon from "./spell-icon";
import SpellWriteupPanel from "./spell-writeup-panel";
import { useSpellOwners, useSpellWriteup } from "./spell-writeups";

type BrowseMode = "player" | "all" | "new";
const PAGE_SIZE = 60;
const CLASS_IDS = Object.keys(SPELL_CLASSES).map(Number);

function formatTime(ms: number) {
  if (ms < 0) return "∞";
  if (ms === 0) return "0";
  const seconds = ms / 1000;
  return seconds < 60 ? `${Number(seconds.toFixed(1))} sec` : `${Number((seconds / 60).toFixed(1))} min`;
}

const SpellBrowser = ({ target, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget }) => {
  const { t, i18n } = useTranslation();
  const openReference = useReferenceNavigation();
  const { rows, error } = useSpellIndex();
  const owners = useSpellOwners();
  const [selectedMode, setMode] = useState<BrowseMode | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(SPELL_CLASS_IDS[target.group ?? ""] ?? null);
  const [query, setQuery] = useState(target.id ? target.name ?? "" : "");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<number | null>(Number(target.id) || null);
  const [showDetail, setShowDetail] = useState(Boolean(target.id));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const byId = useMemo(() => new Map(rows?.map((row) => [row[0], row]) ?? []), [rows]);
  const mode = selectedMode ?? (target.id && !byId.get(Number(target.id))?.[4] ? "all" : "player");
  const classId = selectedClassId ?? (byId.get(Number(target.id))?.[4] || owners?.get(Number(target.id))?.classId || 0);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const phrase = query.trim().toLocaleLowerCase();
    const matches = rows.filter((row) => {
      if (mode === "player" && !row[4]) return false;
      if (mode === "new" && !row[5]) return false;
      if (classId && row[4] !== classId && (mode === "player" || owners?.get(row[0])?.classId !== classId)) return false;
      return !phrase || row[1].toLocaleLowerCase().includes(phrase)
        || String(row[0]).includes(phrase) || row[2].toLocaleLowerCase().includes(phrase);
    });
    const relevance = (row: SpellIndexRow) => !phrase ? 0 : String(row[0]) === phrase || row[1].toLocaleLowerCase() === phrase ? 0
      : row[1].toLocaleLowerCase().startsWith(phrase) ? 1 : row[1].toLocaleLowerCase().includes(phrase) ? 2 : 3;
    matches.sort((a, b) => relevance(a) - relevance(b) || a[1].localeCompare(b[1]) || a[4] - b[4] || a[0] - b[0]);
    if (mode !== "player" || /^\d+$/.test(phrase)) return matches;
    const seen = new Set<string>();
    return matches.filter((row) => {
      const key = `${row[4]}:${row[1]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows, mode, classId, query, owners]);
  const globalQueryMatch = Boolean(filtered.length === 0 && query.trim() && rows?.some((row) => row[1].toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    || row[2].toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || String(row[0]).includes(query.trim())));
  const activeId = selectedId ?? filtered[0]?.[0] ?? null;
  const selected = activeId ? byId.get(activeId) : undefined;
  const { detail, error: detailError } = useSpellDetail(activeId);
  const description = getSpellDescription(detail?.d, detail?.a);
  const { owner, writeup } = useSpellWriteup(activeId);
  const [effectNames, setEffectNames] = useState<SpellEffectNames | null>(null);
  useEffect(() => {
    let active = true;
    void loadSpellEffectNames().then((value) => { if (active) setEffectNames(value); }).catch(() => { /* Numeric effect IDs remain visible. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (selected) onCurrentChange?.({ category: "spells", id: String(selected[0]), name: selected[1] });
  }, [selected, onCurrentChange]);

  const changeMode = (next: BrowseMode) => { setMode(next); setSelectedClassId(0); setLimit(PAGE_SIZE); setSelectedId(null); setShowDetail(false); };
  const choose = (row: SpellIndexRow) => { setSelectedId(row[0]); setShowDetail(true); };
  const ranks = (owner?.ranks ?? (selected && selected[4] ? rows?.filter((row) => row[4] === selected[4] && row[1] === selected[1]).map((row) => ({ id: row[0], name: row[2] || row[1], level: undefined })) ?? [] : [])).filter((rank) => byId.has(rank.id));
  const className = owner?.className || (selected ? SPELL_CLASSES[selected[4]] : undefined);

  return <div className="@container flex min-h-0 flex-1 bg-background">
    <aside className={cn("relative min-h-0 w-full shrink-0 flex-col border-r border-border", sidebarCollapsed ? "@min-[800px]:w-10" : "@min-[800px]:w-[calc(16rem*var(--app-font-scale))]", showDetail ? "hidden @min-[800px]:flex" : "flex")}>
      <ReferenceSidebarToggle collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} className="hidden @min-[800px]:grid" />
      <div className={cn("shrink-0 border-b border-border p-4", sidebarCollapsed && "@min-[800px]:hidden")}>
        <div className="@min-[800px]:hidden"><ReferenceBackLink label={backLabel} onBack={onBack} /></div>
        <h1 className="pr-8 font-display text-xl font-semibold text-white">{t("spells.title")}</h1>
        <CategoryDropdown value={mode} onChange={(value) => changeMode(value as BrowseMode)} ariaLabel={t("spells.browseMode")} triggerClassName="mt-4" options={(["player", "all", "new"] as const).map((key) => ({ key, label: t(`spells.modes.${key}`), labelContent: key === "new" ? <ForeverLabel text={t("spells.modes.new")} /> : undefined }))} />
        {(mode === "player" || mode === "all") && <CategoryDropdown value={String(classId)} onChange={(value) => { setSelectedClassId(Number(value)); setSelectedId(null); setLimit(PAGE_SIZE); }} ariaLabel={t("spells.classFilter")} triggerClassName="mt-2" options={[{ key: "0", label: t("spells.allClasses") }, ...CLASS_IDS.map((id) => ({ key: String(id), label: SPELL_CLASSES[id] }))]} />}
        <label className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 focus-within:border-accent"><Search size={14} className="shrink-0 text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); setSelectedId(null); }} placeholder={t("spells.search")} aria-label={t("spells.search")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" /></label>
        {rows && <p className="mt-2 text-[11px] tabular-nums text-subtle" aria-live="polite">{t("spells.results", { count: filtered.length })}</p>}
      </div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", sidebarCollapsed && "@min-[800px]:hidden")}>
        {!rows && <p className="p-3 text-[12px] text-subtle" role={error ? "alert" : "status"}>{t(error ? "spells.loadError" : "reference.loading")}</p>}
        {rows && filtered.slice(0, limit).map((row) => <button key={row[0]} type="button" onClick={() => choose(row)} aria-current={activeId === row[0] ? "true" : undefined}
          className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent", activeId === row[0] ? "bg-accent-soft" : "hover:bg-white/[0.05]")}>
          <SpellIcon id={row[3]} name={row[1]} size={32} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-white">{row[1]}</span><span className="block truncate text-[10px] text-subtle">{row[2] || SPELL_CLASSES[row[4]] || t("spells.otherRecord")}</span></span>{row[5] ? <span className="text-[10px] font-semibold text-accent">{t("spells.new")}</span> : null}
        </button>)}
        {rows && filtered.length === 0 && <div className="p-3 text-[12px] text-subtle"><p>{t("database.noMatches")}</p>{globalQueryMatch && (mode !== "all" || classId !== 0) && <button type="button" onClick={() => { setMode("all"); setSelectedClassId(0); }} className="mt-2 cursor-pointer font-semibold text-accent hover:underline">{t("spells.searchAllRecords")}</button>}</div>}
        {limit < filtered.length && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="w-full cursor-pointer rounded-[var(--radius-sm)] py-3 text-[12px] font-semibold text-accent hover:bg-accent-soft">{t("spells.showMore", { count: Math.min(PAGE_SIZE, filtered.length - limit) })}</button>}
      </div>
    </aside>

    <section className={cn("scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto", showDetail ? "block" : "hidden @min-[800px]:block")}>
      <div className="w-full">
        {!selected ? <div className="px-4 py-6 @min-[800px]:px-6"><ReferenceBackLink label={backLabel} onBack={onBack} />{showDetail && <button type="button" onClick={() => setShowDetail(false)} className="mb-4 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-accent @min-[800px]:hidden"><ArrowLeft size={14} aria-hidden="true" />{t("spells.backToList")}</button>}<p className="text-left text-[12px] text-subtle">{t("spells.selectSpell")}</p></div> : <>
          <header className="border-b border-border bg-surface/30 px-4 py-5 @min-[800px]:px-6">
          <ReferenceBackLink label={backLabel} onBack={onBack} />
          {showDetail && <button type="button" onClick={() => setShowDetail(false)} className="mb-4 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-accent @min-[800px]:hidden"><ArrowLeft size={14} aria-hidden="true" />{t("spells.backToList")}</button>}
          <div className="ml-0 mr-auto flex max-w-[808px] items-center gap-4"><SpellIcon id={selected[3]} name={selected[1]} size={60} /><div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              {className ? <button type="button" onClick={() => openReference({ category: "classes", id: className.toLowerCase(), name: className })} className="cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-accent">{className}</button> : <span>{(!/^rank\b/i.test(selected[2]) ? selected[2] : "") || t("spells.otherRecord")}</span>}
              {selected[5] ? <span className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft px-1.5 py-0.5">{t("spells.new")}</span> : null}
              {detail?.old && detail.old !== detail.d ? <span className="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-zinc-300">{t("spells.changed")}</span> : null}
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold text-white @min-[550px]:text-2xl">{selected[1]}</h2><p className="mt-0.5 text-[12px] text-subtle">{selected[2] || t("spells.noRank")} · ID {selected[0].toLocaleString(i18n.language)}</p>
          </div></div>
          </header>
          <div className="ml-0 mr-auto max-w-[808px] space-y-7 px-4 py-6 @min-[800px]:px-6">
          {!detail && <p className="text-[12px] text-subtle" role={detailError ? "alert" : "status"}>{t(detailError ? "spells.detailError" : "reference.loading")}</p>}
          {detail && <>
            <div className="border-b border-border pb-5">
              <div className="grid gap-x-8 gap-y-1.5 text-[12px] @min-[590px]:grid-cols-2">
                {detail.sc && <p><span className="text-subtle">{t("spells.school")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.sc}</span></p>}
                <p><span className="text-subtle">{t("spells.cast")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.pa ? t("spells.passive") : detail.ct ? formatTime(detail.ct) : t("spells.instant")}</span></p>
                {owner?.talentTree ? <p><span className="text-subtle">{t("spells.talent")}</span> <span className="ml-1 font-medium text-zinc-100">{owner.talentTree} · {t("spells.tier", { tier: owner.talentTier })} · {t("spells.fromLevel", { level: owner.talentLevel })}</span></p>
                  : detail.lv !== undefined && <p><span className="text-subtle">{t("spells.level")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.lv}</span></p>}
                {detail.cd !== undefined && detail.cd > 0 && <p><span className="text-subtle">{t("spells.cooldown")}</span> <span className="ml-1 font-medium text-zinc-100">{formatTime(detail.cd)}</span></p>}
                {detail.du !== undefined && detail.du !== 0 && <p><span className="text-subtle">{t("spells.duration")}</span> <span className="ml-1 font-medium text-zinc-100">{formatTime(detail.du)}</span></p>}
                {detail.rg && <p><span className="text-subtle">{t("spells.range")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.rg[0] ? `${detail.rg[0]}–` : ""}{detail.rg[1]} yd</span></p>}
                {detail.co?.map(([amount, resource, percent], index) => <p key={index}><span className="text-subtle">{t("spells.cost")}</span> <span className="ml-1 font-medium text-zinc-100">{percent ? `${amount}% ${t("spells.ofBase")} ${resource}` : `${amount} ${resource}`}</span></p>)}
                {detail.dt && <p><span className="text-subtle">{t("spells.dispelType")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.dt}</span></p>}
                {detail.mc && <p><span className="text-subtle">{t("spells.mechanic")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.mc}</span></p>}
                {detail.pc && <p><span className="text-subtle">{t("spells.procChance")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.pc}%</span></p>}
                {detail.sp && <p><span className="text-subtle">{t("spells.spellPowerCoefficient")}</span> <span className="ml-1 font-medium text-zinc-100">{detail.sp}{detail.osp !== undefined && <span className="ml-1 text-subtle">· {t("spells.classicEra")} {detail.osp}</span>}</span></p>}
                {owner?.classLine && <p><span className="text-subtle">{t("spells.classLine")}</span> <span className="ml-1 font-medium text-zinc-100">{owner.classLine}</span></p>}
                {owner?.races?.length ? <p><span className="text-subtle">{t("spells.races")}</span> <span className="ml-1 font-medium text-zinc-100">{owner.races.join(", ")}</span></p> : null}
                {owner?.faction && <p><span className="text-subtle">{t("spells.faction")}</span> <span className="ml-1 font-medium text-zinc-100">{owner.faction}</span></p>}
              </div>
              {description && <p className="select-text mt-4 border-t border-border pt-3 text-[13px] leading-6 text-zinc-100">{description}</p>}
              {owner?.source && owner.source !== "trainer" && <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-subtle">{t(owner.source === "sod" ? "spells.sources.sod" : "spells.sources.other")}</p>}
              {owner?.rune === "promoted" && <p className="mt-2 text-[11px] leading-5 text-subtle">{t("spells.sources.promoted")}</p>}
              {ranks.length > 1 && <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-medium text-subtle">{t("spells.ranks", { count: ranks.length })}</p>
                <div className="flex flex-wrap gap-1.5">{ranks.map((rank) =>
                  <button key={rank.id} type="button" onClick={() => setSelectedId(rank.id)} aria-current={activeId === rank.id ? "true" : undefined} className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left text-[11px] focus-visible:outline-2 focus-visible:outline-accent", activeId === rank.id ? "border-accent bg-accent-soft text-white" : "border-border bg-surface text-zinc-300 hover:text-white")}><span className="block font-medium">{rank.name}</span>{rank.level && <span className="block text-[10px] text-subtle">{t("spells.fromLevel", { level: rank.level })}</span>}</button>)}</div>
                {owner?.talentTree && <p className="mt-2 text-[11px] leading-5 text-subtle">{t("spells.talentRankNote")}</p>}
              </div>}
            </div>
            <SpellWriteupPanel detail={detail} writeup={writeup} classId={owner?.classId ?? 0} rows={rows ?? []} />
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
    </section>
  </div>;
};

export default SpellBrowser;
