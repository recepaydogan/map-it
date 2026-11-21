import { useGameText } from "../../i18n/game-text";
import { ArrowLeft, BookOpen, ChevronRight, Package } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import wikiUsesIndex from "../../../public/data/enshrouded/wiki-uses-index.json";
import { BUILDING_CATALOG, buildingMapLocations, buildingUsedIn, findBuildingPage,
  getBuildingObtaining, type BuildingRecord } from "./building-catalog";
import { WIKI_NAVIGATION_EVENT, hasWikiPage } from "./wiki-navigation";
import { CRAFTING_NAVIGATION_EVENT, craftingSectionFor, hasCraftingPage } from "../crafting/crafting-navigation";
import { findProgressionPage, PROGRESSION_NAVIGATION_EVENT } from "./progression-navigation";
import EnshroudedItemRow from "./enshrouded-item-row";
import InlineLinkedText from "./inline-linked-text";
import { VALID_ENSHROUDED_MARKER_IDS } from "../map/enshrouded-marker-ids";
import EnshroudedWikiProse from "../map/enshrouded-wiki-prose";

const typeKey = (value: string) => value.toLowerCase().replace(/ /g, "-");

const RecordImage = ({ record, size = 42 }: { record: BuildingRecord; size?: number }) => record.icon?.path
  ? <img src={contentUrl(record.icon.path)} alt="" width={size} height={size}
      className="shrink-0 rounded-[var(--radius-sm)] object-contain" />
  : <span className="grid shrink-0 place-items-center text-zinc-400"
      style={{ width: size, height: size }}><Package size={Math.round(size * 0.42)} aria-hidden="true" /></span>;

const SectionHeading = ({ children }: { children: ReactNode }) =>
  {
  return (<h3 className="mb-3 flex items-center gap-3 text-base font-semibold leading-6 text-white">
    <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
    {children}
  </h3>);
};

export default function BuildingGuidePage({ initialPage, onOpenMap }: {
  initialPage: string;
  onOpenMap: (markerId?: string) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const [history, setHistory] = useState<string[]>(() => [findBuildingPage(initialPage)?.sourcePage ?? "Castle Block"]);
  const [showAllMapLocations, setShowAllMapLocations] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const selected = findBuildingPage(history.at(-1)) ?? BUILDING_CATALOG.records[0]!;
  const obtaining = getBuildingObtaining(selected);
  const navigate = (name: string) => {
    const target = findBuildingPage(name);
    if (!target) return;
    setHistory((current) => {
      const visited = current.indexOf(target.sourcePage);
      return visited >= 0 ? current.slice(0, visited + 1) : [...current, target.sourcePage].slice(-32);
    });
    setShowAllMapLocations(false);
  };
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [selected.sourcePage]);

  const openPage = (name: string) => {
    const target = findBuildingPage(name);
    const crafting = craftingSectionFor(name);
    const progression = findProgressionPage(name);
    return target && !(target.sourceCatalog === "Related Pages" && crafting)
      ? () => navigate(name)
      : hasWikiPage(name) && !crafting
        ? () => window.dispatchEvent(new CustomEvent(WIKI_NAVIGATION_EVENT, { detail: name }))
        : progression && !crafting
          ? () => window.dispatchEvent(new CustomEvent(PROGRESSION_NAVIGATION_EVENT, { detail: progression }))
          : hasCraftingPage(name)
            ? () => window.dispatchEvent(new CustomEvent(CRAFTING_NAVIGATION_EVENT, { detail: name }))
            : undefined;
  };
  const Link = ({ name, quantity, label }: { name: string; quantity?: number; label?: string }) => {
    return <EnshroudedItemRow name={name} label={label ?? findBuildingPage(name)?.name}
      quantity={quantity} onClick={openPage(name)} />;
  };

  const facts = [
    [t("buildingGuide.facts.type"), selected.type], [t("buildingGuide.facts.rarity"), selected.rarity],
    [t("buildingGuide.facts.stackSize"), selected.stackSize],
    [t("buildingGuide.craftTime"), selected.recipe.craftTime], [t("buildingGuide.facts.set"), selected.set],
    [t("buildingGuide.facts.level"), selected.level], [t("buildingGuide.facts.biomes"), selected.biomes],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const usedIn = buildingUsedIn(selected);
  const wikiUses = (wikiUsesIndex as Record<string, string[]>)[selected.sourcePage] ?? [];
  const mapLocations = buildingMapLocations(selected);
  const sameSet = selected.set ? BUILDING_CATALOG.records
    .filter((entry) => entry.id !== selected.id && entry.set === selected.set).slice(0, 12) : [];

  return <article ref={detailRef} className="@container scroll-slim h-full overflow-y-auto text-zinc-100">
      <div className="max-w-[800px] px-5 py-5 @min-[760px]:px-6 @min-[760px]:py-6">
        {history.length > 1 && <div className="mb-5">
          <button type="button" onClick={() => setHistory((current) => current.slice(0, -1))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white">
            <ArrowLeft size={15} aria-hidden="true" />{t("buildingGuide.backTo", {
              name: contentText(findBuildingPage(history.at(-2))?.name ?? t("buildingGuide.back")),
            })}
          </button>
        </div>}
        <div className="flex flex-wrap items-start gap-4 border-b border-border pb-6">
          <div className="grid h-20 w-20 shrink-0 place-items-center">
            <RecordImage record={selected} size={64} />
          </div>
          <div className="min-w-[200px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{t(`buildingGuide.catalogs.${typeKey(selected.sourceCatalog)}`)}</p>
            <h2 className="mt-1 text-[25px] font-semibold leading-[1.15] text-white" tabIndex={-1}>{contentText(selected.name)}</h2>
            {contentText(selected.set && <p className="mt-2 text-xs text-zinc-400">{contentText(selected.set)}</p>)}
          </div>
        </div>
        <div className="max-w-[760px] space-y-6 py-6">
            {facts.length > 0 && <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">{facts.map(([label, value]) =>
              <div key={String(label)} className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
                <dd className="mt-1 text-[13px] text-zinc-100">{contentText(String(value))}</dd></div>)}</dl>}
          <div className="min-w-0 space-y-7">
            {contentText(selected.description && <section><SectionHeading>{t("buildingGuide.description")}</SectionHeading>
              <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(selected.description)}</p></section>)}
            {contentText(selected.appearance?.path && <div><img src={contentUrl(selected.appearance.path)} alt={contentText(selected.name)}
              className="max-h-64 w-full object-contain" /></div>)}
            {obtaining && <section>
              <SectionHeading>{t("buildingGuide.unlockedBy")}</SectionHeading>
              <p className="text-[13px] leading-relaxed text-zinc-300">{obtaining.source === "article"
                ? <EnshroudedWikiProse text={obtaining.text} name={selected.name}
                  onOpenEntry={(target) => { openPage(target.page)?.(); }} onOpenMap={(markerId) => onOpenMap(markerId)} />
                : <InlineLinkedText value={obtaining.text}
                links={obtaining.links.map((link) => ({
                  label: link.label,
                  onClick: link.page === "Map"
                    ? link.markerId && VALID_ENSHROUDED_MARKER_IDS.has(link.markerId)
                      ? () => onOpenMap(link.markerId) : undefined
                    : openPage(link.page),
                }))} />}</p>
            </section>}
            <section><SectionHeading>{t("buildingGuide.crafting", { name: contentText(selected.name) })}</SectionHeading>
              {selected.recipe.status === "listed" ? <div className="grid gap-5">
                  <div><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("buildingGuide.ingredients")}</h4>
                    <div className="grid gap-x-5 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
                      {selected.recipe.ingredients?.map((part) => <Link key={part.name} name={part.page ?? part.name} label={part.name} quantity={part.quantity} />)}</div></div>
                  <div><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("buildingGuide.workstation")}</h4>
                    <div className="grid w-full max-w-[380px] gap-1.5">{selected.recipe.workstations?.map((name) => <Link key={name} name={name} />)}</div></div>
              </div> : <p className="text-[13px] text-zinc-400">{t(`buildingGuide.recipeStatus.${selected.recipe.status}`)}</p>}
            </section>
            {usedIn.length > 0 && <section><SectionHeading>{t("buildingGuide.usedIn", { count: usedIn.length })}</SectionHeading>
              <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{usedIn.map((entry) => <Link key={entry.id} name={entry.sourcePage} />)}</div></section>}
            {wikiUses.length > 0 && <section><SectionHeading>{t("buildingGuide.usedInWiki", { count: wikiUses.length })}</SectionHeading>
              <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{wikiUses.map((page) => <Link key={page} name={page} />)}</div></section>}
            {mapLocations.length > 0 && <section><SectionHeading>{t("buildingGuide.mapLocations", { count: mapLocations.length })}</SectionHeading>
              <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{(showAllMapLocations ? mapLocations : mapLocations.slice(0, 12)).map((location) =>
                <button key={location.id} type="button" onClick={() => onOpenMap(location.id)}
                  className="flex items-center gap-2 py-1.5 text-left text-xs text-zinc-200 hover:text-white">
                  <span className="truncate">{contentText(location.name)}</span>
                  <ChevronRight size={13} className="ml-auto shrink-0 text-zinc-500" aria-hidden="true" />
                </button>)}</div>
              {mapLocations.length > 12 && <button type="button" onClick={() => setShowAllMapLocations((value) => !value)}
                className="mt-2 text-xs text-accent hover:text-white">{contentText(showAllMapLocations
                  ? t("buildingGuide.showFewerLocations")
                  : t("buildingGuide.showAllLocations", { count: mapLocations.length }))}</button>}
            </section>}
            {sameSet.length > 0 && <section><SectionHeading>{t("buildingGuide.sameSet")}</SectionHeading>
              <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{sameSet.map((entry) => <Link key={entry.id} name={entry.sourcePage} />)}</div></section>}
          </div>
          <aside className="min-w-0 space-y-5">
            {selected.sourceCatalog === "Related Pages" && <div className="text-xs text-zinc-400"><BookOpen size={16} className="mb-2 text-zinc-400" />{t("buildingGuide.relatedPage")}</div>}
          </aside>
        </div>
      </div>
    </article>;
}
