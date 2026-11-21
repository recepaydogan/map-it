import { useGameText } from "../../i18n/game-text";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import guideCatalog from "../../../public/data/enshrouded/location-guide.json";
import { hasEnshroudedEntry, type EnshroudedEntryTarget } from "./enshrouded-entry-data";
import EnshroudedMarkerEntryCard from "./enshrouded-marker-entry-card";
import EnshroudedLootRows from "./enshrouded-loot-rows";

type RegionStats = { sparks: number; essence: string; forgeMax: number; sanctumForgeMax: number };
const facts = guideCatalog.categoryFacts as Record<string, string[] | undefined>;
const regionStats = guideCatalog.regionStats as Record<string, RegionStats | undefined>;
const collectionSets = guideCatalog.collectionSets as Record<string, string | undefined>;
const markerQuests = guideCatalog.markerQuests as Record<string, string | undefined>;
const hallArtifacts = guideCatalog.hollowHalls.artifactsByRegion as Record<string, string[] | undefined>;
const regionAliases = guideCatalog.regionAliases as Record<string, string | undefined>;
const hallPreviewCount = 6;

const target = (page: string, catalog: string): EnshroudedEntryTarget => ({ page, catalog });
const uniqueTargets = (items: EnshroudedEntryTarget[]) => items.filter((item, index) =>
  items.findIndex((candidate) => candidate.page === item.page) === index && hasEnshroudedEntry(item));

export default function EnshroudedLocationGuide({ markerId, markerCategory, markerDescription, foundMaterials = [], activeEntry, onOpenEntry }: {
  markerId: string;
  markerCategory: string;
  markerDescription?: string;
  foundMaterials?: EnshroudedEntryTarget[];
  activeEntry?: EnshroudedEntryTarget;
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const [expandedHallId, setExpandedHallId] = useState<string | null>(null);
  const rawRegion = markerCategory === "wiki-hollow_halls" ? markerId.split("-")[1] : markerId.split("-")[0];
  const region = regionAliases[rawRegion] ?? rawRegion;
  const stats = regionStats[region];
  const categoryFacts = facts[markerCategory] ?? [];
  const isForge = markerCategory === "wiki-gem_forge";
  const isShrine = markerCategory === "wiki-flame_shrine";
  const isHall = markerCategory === "wiki-hollow_halls";
  const isLore = markerCategory.startsWith("wiki-lore");
  const hasSanctumForge = isForge && /inside (?:the )?night sanctum/i.test(markerDescription ?? "");
  const collectionSet = collectionSets[markerCategory];
  const quest = markerQuests[markerId];
  const related = uniqueTargets([
    ...(collectionSet ? [target(collectionSet, "progression")] : []),
    ...(quest ? [target(quest, "progression")] : []),
    ...(isShrine ? [target("Spark", "crafting")] : []),
    ...(isForge && stats ? [target(stats.essence, "crafting")] : []),
    ...(markerCategory === "wiki-dragonsmappiece"
      ? [target("Quests/The Dragons' Last Breath", "progression"), target("Dragon's Wing", "wiki")] : []),
  ]);
  const artifacts = isHall ? uniqueTargets((hallArtifacts[region] ?? []).map((page) => target(page, "wiki"))) : [];
  const artifactPages = new Set(artifacts.map((item) => item.page.toLocaleLowerCase("en")));
  const localMaterials = isHall ? uniqueTargets(foundMaterials)
    .filter((item) => !artifactPages.has(item.page.toLocaleLowerCase("en"))) : [];
  const localPages = new Set([...artifactPages, ...localMaterials.map((item) => item.page.toLocaleLowerCase("en"))]);
  const materials = isHall ? uniqueTargets(guideCatalog.hollowHalls.materials.map((page) => target(page, "crafting")))
    .filter((item) => !localPages.has(item.page.toLocaleLowerCase("en"))) : [];
  const weapons = isHall ? uniqueTargets(guideCatalog.hollowHalls.weapons.map((page) => target(page, "wiki"))) : [];
  const hallItems = [
    ...artifacts.map((item) => ({ item, detail: t("map.enshrouded.locationGuide.hallArtifactHere") })),
    ...localMaterials.map((item) => ({ item, detail: t("map.enshrouded.locationGuide.hallMaterialHere") })),
    ...materials.map((item) => ({ item, detail: t("map.enshrouded.locationGuide.hallMaterialOverall") })),
    ...weapons.map((item) => ({ item, detail: t("map.enshrouded.locationGuide.hallWeaponOverall") })),
  ].filter((entry, index, entries) => entries.findIndex((candidate) =>
    candidate.item.page.toLocaleLowerCase("en") === entry.item.page.toLocaleLowerCase("en")) === index);
  const hallExpanded = expandedHallId === markerId;
  const visibleHallItems = hallExpanded ? hallItems : hallItems.slice(0, hallPreviewCount);
  const hasStats = Boolean(stats && (isShrine || isForge));
  if (!categoryFacts.length && !isLore && !related.length && !hasStats && !materials.length
    && !localMaterials.length && !weapons.length && !artifacts.length) return null;

  const cards = (entries: EnshroudedEntryTarget[]) => <div className="mt-2 grid gap-1.5">
    {entries.map((item) => <EnshroudedMarkerEntryCard key={`${item.catalog}:${item.page}`}
      target={item} activeEntry={activeEntry} onOpen={onOpenEntry} />)}
  </div>;
  return <section className="mt-4 border-t border-border/60 pt-3">
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {t("map.enshrouded.locationGuide.title")}
    </h3>
    {isLore && <p className="mt-2 text-xs leading-relaxed text-zinc-300">
      {t("map.enshrouded.locationGuide.loreChapter")}
    </p>}
    {categoryFacts.length > 0 && <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-300">
      {categoryFacts.map((key) => <li key={key} className="flex gap-2">
        <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <span>{t(`map.enshrouded.locationGuide.facts.${key}`)}</span>
      </li>)}
    </ul>}
    {stats && isShrine && <div className="mt-3 flex items-center justify-between rounded-md border border-border/70 bg-white/[0.025] px-3 py-2 text-xs">
      <span className="text-zinc-400">{t("map.enshrouded.locationGuide.sparkYield")}</span>
      <span className="font-semibold text-accent">×{stats.sparks}</span>
    </div>}
    {stats && isForge && <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-md border border-border/70 bg-white/[0.025] px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">{t("map.enshrouded.locationGuide.maxGemLevel")}</div>
        <div className="mt-1 text-sm font-semibold text-accent">{hasSanctumForge ? stats.sanctumForgeMax : stats.forgeMax}</div>
      </div>
      <div className="rounded-md border border-border/70 bg-white/[0.025] px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">{t("map.enshrouded.locationGuide.forgeType")}</div>
        <div className="mt-1 text-xs font-medium text-zinc-100">{t(`map.enshrouded.locationGuide.${hasSanctumForge ? "sanctumForge" : "regularForge"}`)}</div>
      </div>
    </div>}
    {related.length > 0 && <div className="mt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {t("map.enshrouded.locationGuide.connectedEntries")}
      </h4>
      {cards(related)}
    </div>}
    {isHall && hallItems.length > 0 && <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
      <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
        {t("map.enshrouded.locationGuide.hallItems")}
        <span className="font-normal tabular-nums tracking-normal text-zinc-500">
          {hallItems.length}</span>
      </h4>
      <EnshroudedLootRows rows={visibleHallItems.map(({ item, detail }) =>
        ({ name: item.page, target: item, detail }))} onOpenEntry={onOpenEntry} />
      {hallItems.length > hallPreviewCount && <button type="button" aria-expanded={hallExpanded}
        onClick={() => setExpandedHallId(hallExpanded ? null : markerId)}
        className="text-xs text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {contentText(hallExpanded ? t("map.enshrouded.showLess")
          : t("map.enshrouded.showMore", { count: hallItems.length - hallPreviewCount }))}
      </button>}
    </div>}
  </section>;
}
