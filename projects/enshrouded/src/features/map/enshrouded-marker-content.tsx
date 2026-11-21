import { useGameText } from "../../i18n/game-text";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import wikiCatalog from "../../../public/data/enshrouded/wiki-catalog.json";
import bestiaryCatalog from "../../../public/data/enshrouded/bestiary-catalog.json";
import wikiMapLinks from "../../../public/data/enshrouded/wiki-map-links.json";
import progressionCatalog from "../../../public/data/enshrouded/progression-catalog.json";
import buildingCatalog from "../../../public/data/enshrouded/building-catalog.json";
import markerSourceLinks from "../../../public/data/enshrouded/marker-source-links.json";
import shroudLairGuide from "../../../public/data/enshrouded/shroud-lair-guide.json";
import locationGuideCatalog from "../../../public/data/enshrouded/location-guide.json";
import markerPanels from "../../../public/data/enshrouded/marker-panels.json";
import { findProgressionPage } from "../knowledge/progression-navigation";
import { hasEnshroudedEntry, resolveEnshroudedEntry, type EnshroudedEntryTarget } from "./enshrouded-entry-data";
import EnshroudedMarkerEntryCard from "./enshrouded-marker-entry-card";
import EnshroudedBestiaryMarkerContent from "./enshrouded-bestiary-marker-content";
import EnshroudedLocationGuide from "./enshrouded-location-guide";
import EnshroudedLootRows from "./enshrouded-loot-rows";
import EnshroudedMarkerProse from "./enshrouded-marker-prose";

type Link = { page: string; label?: string; markerId?: string };
type Npc = { id: string; name: string; role: string; group: string; image: string | null; description: string | null;
  facts: { name: string; links: Link[] }[];
  sections: { title: string; blocks: unknown[] }[] };
type Quest = { id: string; name: string; group: string; sections: unknown[] };
type SetItem = { id: string; name: string; sections: unknown[]; facts: unknown[] };
type WikiRecord = { id: string; name: string; catalog: string; description: string | null;
  type: string | null; rarity: string | null; related: string[] };
type BuildingRecord = { sourcePage: string; name: string; availability: { links: Link[] } | null };
type SourceLink = { page: string; catalogs: string[]; relation: "found" | "related" | "possible" };

const wikiRecords = (wikiCatalog as { records: WikiRecord[] }).records;
const progression = progressionCatalog as unknown as { npcs: Npc[]; quests: Quest[]; setItems: SetItem[] };
const buildings = (buildingCatalog as unknown as { records: BuildingRecord[] }).records;
const exactWikiLinks = wikiMapLinks as Record<string, string[]>;
const sourceLinks = markerSourceLinks as Record<string, SourceLink[]>;
const panelContent = markerPanels.markers as Record<string, {
  entries: EnshroudedEntryTarget[];
  paragraphs: { text: string; kind: "lore" | "overview"; textKey?: string }[];
}>;
const add = <T,>(index: Map<string, T[]>, markerId: string, value: T) =>
  index.set(markerId, [...(index.get(markerId) ?? []), value]);
const bestiaryByWikiLocation = new Map<string, { name: string; faction: string; wikiArticle: string; image: string | null }[]>();
for (const entry of bestiaryCatalog.records) {
  for (const location of entry.wikiLocations) {
    add(bestiaryByWikiLocation, location.markerId, entry);
  }
}

function markerIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!item || typeof item !== "object") return;
    const fields = item as Record<string, unknown>;
    if (typeof fields.markerId === "string") ids.add(fields.markerId);
    Object.values(fields).forEach(visit);
  };
  visit(value);
  return ids;
}

const npcByMarker = new Map<string, Npc[]>();
const relatedNpcsByMarker = new Map<string, Npc[]>();
for (const npc of progression.npcs) {
  const homeIds = new Set<string>();
  for (const fact of npc.facts.filter((entry) => entry.name === "Location")) {
    for (const link of fact.links) if (link.markerId) {
      add(npcByMarker, link.markerId, npc);
      homeIds.add(link.markerId);
    }
  }
  for (const id of markerIds(npc.sections)) if (!homeIds.has(id)) add(relatedNpcsByMarker, id, npc);
}
const questsByMarker = new Map<string, Quest[]>();
for (const quest of progression.quests) {
  for (const id of markerIds(quest.sections)) add(questsByMarker, id, quest);
}
const setItemsByMarker = new Map<string, SetItem[]>();
for (const item of progression.setItems) {
  for (const id of markerIds([item.facts, item.sections])) add(setItemsByMarker, id, item);
}
const exactWikiByMarker = new Map<string, WikiRecord[]>();
const contextualWikiByMarker = new Map<string, WikiRecord[]>();
for (const record of wikiRecords) {
  for (const id of exactWikiLinks[record.id] ?? []) add(exactWikiByMarker, id, record);
  for (const id of record.related) {
    if (!(exactWikiLinks[record.id] ?? []).includes(id)) add(contextualWikiByMarker, id, record);
  }
}
const buildingByMarker = new Map<string, BuildingRecord[]>();
for (const record of buildings) {
  for (const link of record.availability?.links ?? []) {
    if (link.markerId && link.page === "Map") add(buildingByMarker, link.markerId, record);
  }
}
export default function EnshroudedMarkerContent({ markerId, markerCategory, markerDescription, bestiaryArticle, activeEntry, onOpenEntry }: { markerId: string;
  markerCategory: string;
  markerDescription?: string;
  bestiaryArticle?: string;
  activeEntry?: EnshroudedEntryTarget;
  onOpenEntry: (target: EnshroudedEntryTarget) => void }) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const panel = panelContent[markerId];
  const isElixirWell = markerCategory === "wiki-elixir_well";
  const isHall = markerCategory === "wiki-hollow_halls";
  const isShroudLair = markerCategory === "wiki-shroud_lair";
  const shroudLairRegion = markerId.split("-ShroudLair")[0] as keyof typeof shroudLairGuide.essenceByLocationPrefix;
  const shroudLairEssence = isShroudLair ? shroudLairGuide.essenceByLocationPrefix[shroudLairRegion] : undefined;
  const npcs = npcByMarker.get(markerId) ?? [];
  const relatedNpcs = relatedNpcsByMarker.get(markerId) ?? [];
  const exactWiki = exactWikiByMarker.get(markerId) ?? [];
  const contextualWiki = contextualWikiByMarker.get(markerId) ?? [];
  const building = buildingByMarker.get(markerId) ?? [];
  const source = sourceLinks[markerId] ?? [];
  const bestiaryAtLocation = isElixirWell ? [] : (bestiaryByWikiLocation.get(markerId) ?? [])
    .filter((entry) => entry.wikiArticle !== bestiaryArticle);
  const unlockQuests = npcs.flatMap((npc) => npc.facts.filter((fact) => fact.name === "Unlock Quest")
    .flatMap((fact) => fact.links)).filter((link) => findProgressionPage(link.page));
  const npcQuests = progression.quests.filter((quest) => npcs.some((npc) => quest.group === `${npc.name} Quests`));
  const locationQuests = (questsByMarker.get(markerId) ?? []).filter((quest) =>
    !unlockQuests.some((link) => link.page === quest.id) && !npcQuests.some((entry) => entry.id === quest.id));
  const setItems = setItemsByMarker.get(markerId) ?? [];
  const directPages = new Set([
    ...exactWiki.map((entry) => entry.id), ...contextualWiki.map((entry) => entry.id),
    ...building.map((entry) => entry.sourcePage),
    ...npcs.map((entry) => entry.id), ...relatedNpcs.map((entry) => entry.id), ...unlockQuests.map((link) => link.page),
    ...npcQuests.map((entry) => entry.id), ...locationQuests.map((entry) => entry.id),
    ...setItems.map((entry) => entry.id),
  ].map((page) => page.toLocaleLowerCase("en")));
  const contextualSource = source.filter((link) => !directPages.has(link.page.toLocaleLowerCase("en"))
    && hasEnshroudedEntry({ page: link.page, catalog: link.catalogs[0] }))
    .filter((link, index, links) => links.findIndex((entry) =>
      entry.page.toLocaleLowerCase("en") === link.page.toLocaleLowerCase("en")) === index);
  const sourceGroups = { foundMaterials: [] as EnshroudedEntryTarget[],
    foundItems: [] as EnshroudedEntryTarget[], relatedMaterials: [] as EnshroudedEntryTarget[],
    relatedItems: [] as EnshroudedEntryTarget[],
    possibleItems: [] as EnshroudedEntryTarget[],
    other: [] as EnshroudedEntryTarget[] };
  for (const sourceLink of contextualSource) {
    const target = { page: sourceLink.page, catalog: sourceLink.catalogs[0] };
    const entry = resolveEnshroudedEntry(target);
    if (!entry) continue;
    if (sourceLink.relation === "possible") {
      sourceGroups.possibleItems.push(target);
      continue;
    }
    if (entry.kind === "building" || entry.kind === "crafting" && /material|resource/i.test(entry.value?.type ?? "")) {
      sourceGroups[sourceLink.relation === "found" ? "foundMaterials" : "relatedMaterials"].push(target);
    } else if (entry.kind === "wiki" || entry.kind === "crafting") {
      sourceGroups[sourceLink.relation === "found" ? "foundItems" : "relatedItems"].push(target);
    } else sourceGroups.other.push(target);
  }
  if (isElixirWell) sourceGroups.other = [];
  const foundMaterials = [
    ...building.map((record) => ({ page: record.sourcePage, catalog: "building" })),
    ...sourceGroups.foundMaterials,
  ];
  const itemEntries = isHall ? [] : [
    ...exactWiki.map((record) => ({ target: { page: record.id, catalog: "wiki" }, detail: t(record.catalog === "collectibles"
      ? "map.enshrouded.itemFoundCollectible" : "map.enshrouded.itemFoundHere") })),
    ...foundMaterials.map((target) => ({ target, detail: t("map.enshrouded.itemFoundMaterial") })),
    ...sourceGroups.foundItems.map((target) => ({ target, detail: t("map.enshrouded.itemFoundHere") })),
    ...sourceGroups.possibleItems.map((target) => ({ target, detail: t("map.enshrouded.itemPossibleSource") })),
    ...sourceGroups.relatedMaterials.map((target) => ({ target, detail: t("map.enshrouded.itemRelatedMaterial") })),
    ...contextualWiki.map((record) => ({ target: { page: record.id, catalog: "wiki" }, detail: t("map.enshrouded.itemRelated") })),
    ...sourceGroups.relatedItems.map((target) => ({ target, detail: t("map.enshrouded.itemRelated") })),
  ].filter((entry, index, entries) => entries.findIndex((candidate) =>
    candidate.target.page.toLocaleLowerCase("en") === entry.target.page.toLocaleLowerCase("en")) === index);
  const itemExpansionKey = `items:${markerId}`;
  const itemsExpanded = expandedGroups[itemExpansionKey] ?? false;
  const group = (key: string, title: string, items: EnshroudedEntryTarget[], initial = 6,
    variant: "cards" | "loot" = "cards") => {
    if (!items.length) return null;
    const expanded = expandedGroups[key] ?? false;
    const visibleItems = isHall || expanded ? items : items.slice(0, initial);
    return <section className="mt-4 border-t border-border/60 pt-3">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />{title}
        <span className="font-normal tabular-nums tracking-normal text-zinc-500">{items.length}</span>
      </h3>
      {variant === "loot" ? <EnshroudedLootRows rows={visibleItems.map((item) => {
        const entry = resolveEnshroudedEntry(item);
        const name = entry?.kind === "crafting" ? entry.name : entry?.value.name ?? item.page;
        return { name, target: item };
      })} onOpenEntry={onOpenEntry} />
        : <div className="grid gap-1.5">{visibleItems.map((item, index) =>
          <EnshroudedMarkerEntryCard key={`${item.catalog}:${item.page}:${index}`}
            target={item} activeEntry={activeEntry} onOpen={onOpenEntry} />)}</div>}
      {!isHall && items.length > initial && <button type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [key]: !expanded }))}
        className="mt-1 text-xs text-accent hover:text-white">{contentText(expanded ? t("map.enshrouded.showLess")
          : t("map.enshrouded.showAll", { count: items.length }))}</button>}
    </section>;
  };

  if (!npcs.length && !relatedNpcs.length && !exactWiki.length && !contextualWiki.length && !building.length
    && !locationQuests.length && !setItems.length && !Object.values(sourceGroups).some((items) => items.length)
    && !bestiaryArticle && !bestiaryAtLocation.length && !isShroudLair
    && !(locationGuideCatalog.categoryFacts as Record<string, string[] | undefined>)[markerCategory]?.length
    && !markerCategory.startsWith("wiki-lore") && !panel?.paragraphs.length && !markerDescription) return null;

  return <div className="mt-4">
    {markerDescription && <p className="text-xs leading-relaxed text-zinc-300">{contentText(markerDescription)}</p>}
    <EnshroudedMarkerProse paragraphs={panel?.paragraphs ?? []} />
    {contentText(bestiaryArticle && <EnshroudedBestiaryMarkerContent article={bestiaryArticle} onOpenEntry={onOpenEntry} />)}
    {!isShroudLair && <EnshroudedLocationGuide markerId={markerId} markerCategory={markerCategory}
      markerDescription={markerDescription} foundMaterials={isHall ? foundMaterials : undefined}
      activeEntry={activeEntry} onOpenEntry={onOpenEntry} />}
    {isShroudLair && <section className="mt-4 border-t border-border/60 pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {t("map.enshrouded.shroudLair.guideTitle")}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-300">{t("map.enshrouded.shroudLair.overview")}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-300">{t("map.enshrouded.shroudLair.essenceNote")}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{t("map.enshrouded.shroudLair.uniqueWeaponNotice")}</p>
    </section>}
    {contentText(shroudLairEssence && group("shroud-lair-essence", t("map.enshrouded.shroudLair.essence"),
      [{ page: shroudLairEssence, catalog: "crafting" }], 6, "loot"))}
    {isShroudLair && <>
      {group("shroud-lair-weapons", t("map.enshrouded.shroudLair.uniqueWeapons"),
        shroudLairGuide.uniqueWeaponPages.map((page) => ({ page, catalog: "wiki" })), 8, "loot")}
    </>}
    {bestiaryAtLocation.length > 0 && <section className="mt-4 border-t border-border/60 pt-3">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
        {t("map.enshrouded.bestiary.relatedEnemies")}
        <span className="font-normal tabular-nums tracking-normal text-zinc-500">{bestiaryAtLocation.length}</span>
      </h3>
      <div className="grid gap-1.5">
        {bestiaryAtLocation.map((entry) => <EnshroudedMarkerEntryCard key={entry.wikiArticle}
          target={{ page: entry.wikiArticle, catalog: "bestiary" }} activeEntry={activeEntry} onOpen={onOpenEntry} />)}
      </div>
    </section>}
    {group("npc", t("map.enshrouded.character"), npcs.map((entry) =>
      ({ page: entry.id, catalog: "progression" })))}
    {group("relatedNpcs", t("map.enshrouded.relatedCharacters"), relatedNpcs.map((entry) =>
      ({ page: entry.id, catalog: "progression" })))}
    {group("quests", t("map.enshrouded.relatedQuests"), locationQuests.map((quest) =>
      ({ page: quest.id, catalog: "progression" })))}
    {group("setItems", t("map.enshrouded.relatedSetItems"), setItems.map((item) =>
      ({ page: item.id, catalog: "progression" })))}
    {itemEntries.length > 0 && <section className="mt-4 border-t border-border/60 pt-3">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />{t("map.enshrouded.items")}
        <span className="font-normal tabular-nums tracking-normal text-zinc-500">{itemEntries.length}</span>
      </h3>
      <EnshroudedLootRows rows={(itemsExpanded ? itemEntries : itemEntries.slice(0, 6)).map(({ target, detail }) => {
        const entry = resolveEnshroudedEntry(target);
        const name = entry?.kind === "crafting" ? entry.name : entry?.value.name ?? target.page;
        return { name, target, detail };
      })} onOpenEntry={onOpenEntry} />
      {itemEntries.length > 6 && <button type="button" aria-expanded={itemsExpanded}
        onClick={() => setExpandedGroups((current) => ({ ...current, [itemExpansionKey]: !current[itemExpansionKey] }))}
        className="mt-1 text-xs text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {contentText(itemsExpanded ? t("map.enshrouded.showLess")
          : t("map.enshrouded.showMore", { count: itemEntries.length - 6 }))}
      </button>}
    </section>}
    {group("source-other", t("map.enshrouded.relatedEntries"), sourceGroups.other)}
  </div>;
}
