import { useGameText } from "../../i18n/game-text";
import { BookOpen, ChevronLeft, ChevronRight, Hammer, MapPin, Package, Skull, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import wikiMapLinks from "../../../public/data/enshrouded/wiki-map-links.json";
import wikiObtainingMapLinks from "../../../public/data/enshrouded/wiki-obtaining-map-links.json";
import materialLocations from "../../../public/data/enshrouded/material-locations.json";
import gameplayCatalog from "../../../public/data/enshrouded/gameplay-catalog.json";
import EnshroudedItemImage from "../knowledge/enshrouded-item-image";
import InlineLinkedText from "../knowledge/inline-linked-text";
import DatabaseSectionTitle from "../database/database-section-title";
import { getBuildingObtaining, hasMeaningfulObtainingText } from "../knowledge/building-catalog";
import { getCraftingObtaining } from "../crafting/enshrouded-crafting-obtaining";
import { DEFAULT_MAP_ID } from "./map-registry";
import { ENSHROUDED_MARKER_NAMES } from "./enshrouded-marker-ids";
import EnshroudedWikiProse from "./enshrouded-wiki-prose";
import EnshroudedAcquisition from "./enshrouded-acquisition";
import EnshroudedObtainingText from "./enshrouded-obtaining-text";
import EnshroudedEffects from "./enshrouded-effects";
import EnshroudedLootRows, { type EnshroudedLootRow } from "./enshrouded-loot-rows";
import EnshroudedBestiaryMarkerContent from "./enshrouded-bestiary-marker-content";
import EnshroudedWeaponStats from "./enshrouded-weapon-stats";
import { isDurationFact, isEffectFact } from "./enshrouded-effect-facts";
import { crafting, ENSHROUDED_QUEST_ICON, getEnshroudedProgressionImage, hasEnshroudedEntry, isEnshroudedQuest, key,
  resolveEnshroudedEntry, type ContentBlock, type ContentLink, type EnshroudedEntryTarget } from "./enshrouded-entry-data";

const exactWikiMarkers = wikiMapLinks as Record<string, string[]>;
const obtainingWikiMarkers = wikiObtainingMapLinks as Record<string, string[]>;
const listedMaterialPlaces = materialLocations as Record<string, { id: string; name: string }[]>;
const animalGuides = new Map(gameplayCatalog.animals.map((animal) => [animal.name, animal]));

export default function EnshroudedEntryPanel({ target, previousTarget, markerName, onBack, onClose, onOpenEntry, onOpenMap }: {
  target: EnshroudedEntryTarget;
  previousTarget?: EnshroudedEntryTarget;
  markerName: string;
  onBack: () => void;
  onClose: () => void;
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
  onOpenMap: (mapId: string, markerId: string) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const entry = resolveEnshroudedEntry(target);
  const previousEntry = previousTarget ? resolveEnshroudedEntry(previousTarget) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRecipeCount, setVisibleRecipeCount] = useState(12);
  const [visibleLocationCount, setVisibleLocationCount] = useState(8);
  const [recipeQuery, setRecipeQuery] = useState("");
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setVisibleRecipeCount(12);
    setVisibleLocationCount(8);
    setRecipeQuery("");
  }, [target.page, target.catalog]);
  if (!entry) return null;

  const quest = entry.kind === "progression" && isEnshroudedQuest(entry.value);
  const firstQuestSection = quest ? entry.value.sections?.find((value) =>
    !["Overview", "See Also", "Crafted Here"].includes(value.title))?.title : undefined;
  const name = entry.kind === "crafting" ? entry.name
    : entry.kind === "building" ? entry.value.name : entry.value.name;
  const buildingObtaining = entry.kind === "building" ? getBuildingObtaining(entry.value) : null;
  const craftingObtaining = entry.kind === "crafting" ? getCraftingObtaining(entry.value) : null;
  const image = quest ? ENSHROUDED_QUEST_ICON
    : entry.kind === "progression" ? getEnshroudedProgressionImage(entry.value)
    : entry.kind === "bestiary" ? entry.value.image
    : entry.kind === "wiki" ? entry.value.icon
      : entry.kind === "building" ? entry.value.icon?.path : entry.value?.imagePath;
  const title = quest ? t("map.categories.quest")
    : entry.kind === "progression" ? contentText(entry.value.role ?? entry.value.group)
    : entry.kind === "bestiary" ? `${contentText(entry.value.faction)} · ${t(`map.enshrouded.bestiary.${entry.value.role}`)}`
    : entry.kind === "wiki" ? (entry.value.type ? contentText(entry.value.type) : t(`wikiGuide.catalogs.${entry.value.catalog}`))
      : entry.kind === "building" ? (entry.value.type ? contentText(entry.value.type) : t("map.enshrouded.buildingMaterial"))
        : entry.value?.type ? contentText(entry.value.type) : t("map.enshrouded.craftingRecipe");
  const icon = quest ? BookOpen : entry.kind === "progression" ? UserRound : entry.kind === "bestiary" ? Skull
    : entry.kind === "wiki" ? BookOpen
    : entry.kind === "building" ? Hammer : Package;
  const Icon = icon;
  const wikiFacts = entry.kind === "wiki" ? [...entry.value.attributes, ...entry.value.stats] : [];
  const wikiSummaryFacts = entry.kind === "wiki" ? (["rarity", "level", "stackSize", "comfort"] as const)
    .filter((field) => entry.value[field] && !wikiFacts.some((fact) =>
      fact.name.replace(/\s/g, "").toLowerCase() === field.toLowerCase()))
    .map((field) => ({ name: t(`wikiGuide.facts.${field}`), value: entry.value[field]! })) : [];
  const weapon = entry.kind === "wiki" && entry.value.catalog === "equipment"
    && /\b(?:sword|axe|club|hammer|dagger|bow|wand|staff|weapon)s?\b/i.test(entry.value.type ?? "")
    && !/ammunition|ammo/i.test(entry.value.type ?? "")
    && entry.value.stats.some((fact) => /^(level|attackspeed|drawspeed|perks)$/i.test(fact.name));
  const isAnimal = entry.kind === "progression" && entry.value.group === "Animals and Pets";
  const animalRegions = new Set(isAnimal ? entry.value.facts?.find((fact) => fact.name === "Region")
    ?.links.map((link) => link.label) ?? [] : []);
  const progressionFacts = entry.kind === "progression"
    ? entry.value.facts?.filter((fact) => fact.value.trim() && (!isAnimal || fact.name !== "Region")) ?? [] : [];
  const hasProducedItem = (blocks: ContentBlock[]) => blocks.some((block) => {
    const itemIndex = block.headers?.findIndex((header) => header.trim() === "Item") ?? -1;
    return itemIndex >= 0 && block.rows?.some((row) => row[itemIndex]?.text.trim());
  });
  const offspringFrom = (blocks: ContentBlock[]) => blocks.flatMap((block) => block.links ?? [])
    .find((item) => /^Baby /i.test(item.page));
  const backName = previousEntry ? previousEntry.kind === "crafting" ? previousEntry.name
    : previousEntry.value.name : markerName;
  const wikiLocations = entry.kind === "wiki" ? [...new Set([
    ...(exactWikiMarkers[entry.value.id] ?? []), ...(obtainingWikiMarkers[entry.value.id] ?? []),
    ...entry.value.related.filter((markerId) => ENSHROUDED_MARKER_NAMES.has(markerId)),
  ])] : [];
  const materialPlaces = entry.kind === "crafting" || entry.kind === "building"
    ? [...(listedMaterialPlaces[target.page] ?? listedMaterialPlaces[name] ?? []),
      ...(obtainingWikiMarkers[target.page] ?? obtainingWikiMarkers[name] ?? [])
        .map((markerId) => ({ id: markerId, name: ENSHROUDED_MARKER_NAMES.get(markerId) ?? markerId }))] : [];
  const mapPlaces = wikiLocations.length
    ? wikiLocations.map((markerId) => ({ id: markerId, name: ENSHROUDED_MARKER_NAMES.get(markerId) ?? markerId }))
    : materialPlaces.filter((place, index, places) => ENSHROUDED_MARKER_NAMES.has(place.id)
      && places.findIndex((candidate) => candidate.id === place.id) === index);
  const exactPlaces = entry.kind === "wiki" && Boolean(exactWikiMarkers[entry.value.id]?.length);
  const prose = (value: string) => <EnshroudedWikiProse text={value} name={name}
    onOpenEntry={onOpenEntry} onOpenMap={(markerId) => onOpenMap(DEFAULT_MAP_ID, markerId)} />;
  const linkedText = (value: string, links: ContentLink[]): ReactNode => <InlineLinkedText value={value}
    links={links.map(item => ({ label: item.label,
      onClick: item.markerId && item.page === "Map" ? () => onOpenMap(DEFAULT_MAP_ID, item.markerId!)
        : hasEnshroudedEntry({ page: item.page }) ? () => onOpenEntry({ page: item.page }) : undefined,
    }))} />;
  const section = (heading: string, content: ReactNode, count?: number, first = false) =>
    <section className={first ? "space-y-2" : "space-y-2 border-t border-border/60 pt-3"}>
    {count === undefined
      ? <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{heading}</h3>
      : <DatabaseSectionTitle className="mb-0" count={count}>{heading}</DatabaseSectionTitle>}
    {content}</section>;
  const rewardRows = (value: string, links: ContentLink[]): EnshroudedLootRow[] => {
    const rows: EnshroudedLootRow[] = links.filter((item) => item.page !== "Map")
      .map((item) => ({ name: item.label, target: { page: item.page } }));
    const xp = value.match(/\b([\d,]+)\s*XP\b/i)?.[1];
    const recipes = value.match(/\b(\d+)\s+Recipes?\b/i)?.[1];
    if (xp) rows.push({ name: `${xp} XP`, kind: "xp" });
    if (recipes) rows.push({ name: t("progressionGuide.recipesUnlocked", { count: Number(recipes) }), kind: "recipes" });
    if (!rows.length) {
      const other = value.replace(/^Reward\s*:\s*/i, "").trim();
      if (other && other.toLowerCase() !== "none") rows.push({ name: other });
    }
    return rows;
  };
  const entryCard = (page: string, label?: string, quantity?: number | string | null, catalog?: string) => {
    const next = { page, catalog };
    const linked = hasEnshroudedEntry(next);
    const content = <>
      <EnshroudedItemImage name={page} size={34} />
      <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-zinc-100">{contentText(label ?? page)}</span>
      {quantity !== null && quantity !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">×{contentText(quantity)}</span>}
      {linked && <ChevronRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" />}
    </>;
    const className = "flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-md border border-border bg-white/[0.025] px-2.5 py-2 text-left hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent";
    return linked ? <button key={page} type="button" onClick={() => onOpenEntry(next)} className={className}>{content}</button>
      : <div key={page} className={className}>{content}</div>;
  };
  const recipeDetails = (ingredients: { name: string; quantity: number | string | null }[],
    stations: string[], craftTime?: string | null, quantity?: number | string | null) => {
    const facts = [
      [t("map.enshrouded.workstation"), stations.join(" · ")],
      [t("map.enshrouded.craftTime"), craftTime],
      [t("map.enshrouded.yield"), quantity != null && Number(quantity) > 1 ? `×${quantity}` : null],
    ].filter(([, value]) => value);
    return <div className="space-y-3">
      {facts.length > 0 && <dl className={`grid gap-y-2.5 ${facts.length >= 3 ? "grid-cols-3 gap-x-2" : "grid-cols-2 gap-x-4"}`}>
        {facts.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
          <dd className="mt-1 text-[12px] font-medium leading-snug text-zinc-200">{contentText(value)}</dd>
        </div>)}
      </dl>}
      {ingredients.length > 0 && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {t("map.enshrouded.ingredients")}</p>
        <div className="grid grid-cols-1 gap-1.5">{ingredients.map((part) =>
          entryCard(part.name, undefined, part.quantity))}</div>
      </div>}
    </div>;
  };
  const renderBlocks = (blocks: ContentBlock[]) => blocks.map((block, index) => {
    if (block.kind === "text") return <p key={index} className="text-xs leading-relaxed text-zinc-300">{contentText(linkedText(block.text ?? "", block.links ?? []))}</p>;
    if (block.kind === "list") {
      const rewards = block.items?.filter((cell) => /^Reward\s*:/i.test(cell.text)) ?? [];
      const otherItems = block.items?.filter((cell) => !/^Reward\s*:/i.test(cell.text)) ?? [];
      return <div key={index} className="space-y-2">
        {rewards.length > 0 && <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {t("map.enshrouded.locationGuide.completionReward")}</h4>
          <EnshroudedLootRows rows={rewards.flatMap((cell) => rewardRows(cell.text, cell.links ?? []))}
            onOpenEntry={onOpenEntry} />
        </div>}
        {otherItems.length > 0 && <ul className="space-y-2 pl-4 text-xs leading-relaxed text-zinc-300">
          {otherItems.map((cell, cellIndex) => <li key={cellIndex} className="list-disc">
            {contentText(linkedText(cell.text, cell.links))}</li>)}</ul>}
      </div>;
    }
    const headers = block.headers?.map((header) => header.trim().toLocaleLowerCase("en")) ?? [];
    const itemIndex = headers.indexOf("item");
    const quantityIndex = headers.indexOf("quantity");
    if (itemIndex >= 0 && quantityIndex >= 0 && headers.includes("source")) {
      const rows = (block.rows ?? []).flatMap((cells): EnshroudedLootRow[] => {
        const item = cells[itemIndex];
        if (!item?.text) return [];
        const linkedItem = item.links.find((link) => link.page !== "Map");
        return [{ name: item.text, quantity: cells[quantityIndex]?.text ?? null,
          target: { page: linkedItem?.page ?? item.text } }];
      });
      return <EnshroudedLootRows key={index} rows={rows} onOpenEntry={onOpenEntry} />;
    }
    if (block.headers?.some((header) => /objective title/i.test(header))) return <div key={index} className="grid gap-2">
      {block.rows?.map((row, rowIndex) => {
        const [number, title, location, description] = row;
        return <article key={rowIndex} className="rounded-md border border-border bg-white/[0.025] p-3">
          <div className="flex items-start gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold tabular-nums text-accent">
              {contentText(number?.text || rowIndex + 1)}</span>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-semibold text-zinc-100">{contentText(title?.text)}</h4>
              {contentText(location?.text && location.text !== "-" && <p className="mt-1 text-xs text-zinc-400">
                {contentText(linkedText(location.text, location.links))}</p>)}
            </div>
          </div>
          {contentText(description?.text && description.text !== "-" && <p className="mt-2 text-xs leading-relaxed text-zinc-300">
            {contentText(linkedText(description.text, description.links))}</p>)}
        </article>;
      })}</div>;
    return <div key={index} className="space-y-2">{block.rows?.map((row, rowIndex) => <div key={rowIndex}
      className="rounded-md bg-white/[0.04] p-2.5 text-xs leading-relaxed text-zinc-300">
      {row.map((cell, cellIndex) => <div key={cellIndex} className="py-0.5">
        {contentText(block.headers?.[cellIndex] && <span className="mr-1 text-zinc-500">{contentText(block.headers[cellIndex])}:</span>)}
        {contentText(linkedText(cell.text, cell.links))}</div>)}</div>)}</div>;
  });

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-black/20 px-4 py-2">
      <button type="button" onClick={onBack}
        title={t("map.enshrouded.backToEntry", { name: contentText(backName) })}
        aria-label={t("map.enshrouded.backToEntry", { name: contentText(backName) })}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronLeft size={15} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{t("map.enshrouded.backToEntry", { name: contentText(backName) })}</span>
      </button>
    </div>
    <header className="map-details-header shrink-0">
      <span className="map-details-icon">{image ? <img src={contentUrl(image)} alt="" className="h-10 w-10 object-contain" />
        : <Icon size={24} aria-hidden="true" />}</span>
      <div className="map-details-heading"><h2 className="map-details-title">{contentText(name)}</h2>
        <p className="map-details-type">{title}</p></div>
      <button type="button" onClick={onClose} className="map-details-close" aria-label={t("map.enshrouded.closeEntry")}>
        <X size={16} aria-hidden="true" /></button>
    </header>
    <div ref={scrollRef} className="map-details-body scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto">
      {entry.kind === "progression" && <>
        {progressionFacts.length > 0 && <div className="@container">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 border-y border-border/60 py-3 @min-[300px]:grid-cols-2">
            {progressionFacts.map((fact) => <div key={fact.name} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{contentText(fact.name)}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-zinc-200">{contentText(linkedText(fact.value, fact.links))}</dd>
            </div>)}
          </dl>
        </div>}
        {contentText(entry.value.reward && section(t("map.enshrouded.locationGuide.completionReward"),
          <EnshroudedLootRows rows={rewardRows(entry.value.reward, [])} onOpenEntry={onOpenEntry} />))}
        {entry.value.items && entry.value.items.length > 0 && section(
          t("map.enshrouded.locationGuide.collectionItems", { count: entry.value.items.length }),
          <EnshroudedLootRows rows={entry.value.items.map((item) => ({ name: item.name,
            target: { page: item.page } }))} onOpenEntry={onOpenEntry} />)}
        {contentText(!isAnimal && entry.value.description && <p className="text-xs leading-relaxed text-zinc-300">{prose(entry.value.description)}</p>)}
        {contentText(entry.value.role && (() => {
          const equipment = entry.value.sections?.find((value) => value.title === "Crafting Equipment")?.blocks
            .flatMap((block) => block.rows?.flatMap((row) => row.flatMap((cell) => cell.links)) ?? []) ?? [];
          const unique = [...new Map(equipment.map((part) => [key(part.page), part])).values()];
          return unique.length ? section(t("map.enshrouded.craftingEquipment"),
            <div className="grid grid-cols-2 gap-2">{unique.map((part) => entryCard(part.page, part.label, undefined, "crafting"))}</div>) : null;
        })())}
        {entry.value.sections?.filter((value) => value.title !== "See Also" && value.title !== "Crafted Here"
          && value.title !== "NPC Dialogs"
          && (!quest || value.title !== "Overview")
          && (!entry.value.role || !["Overview", "Crafting Equipment"].includes(value.title))
          && (!isAnimal || value.title !== "Overview" && !animalRegions.has(value.title)
            && (value.title !== "Produce" && value.title !== "Drops" || hasProducedItem(value.blocks))
            && (value.title !== "Taming" || Boolean(animalGuides.get(entry.value.name)?.bait))
            && (value.title !== "Breeding" || Boolean(offspringFrom(value.blocks)))))
          .map((value) => {
            if (value.title !== "Quest Objectives") {
              const listedDrops = value.title === "Drops" ? value.blocks.reduce((total, block) =>
                total + (block.headers?.includes("Item") ? block.rows?.length ?? 0 : 0), 0) : undefined;
              if (isAnimal && value.title === "Drops") return <div key={value.title}>
                {section(contentText(value.title), renderBlocks(value.blocks.filter((block) => block.kind === "table")), listedDrops || undefined)}
              </div>;
              if (isAnimal && value.title === "Taming") {
                const bait = animalGuides.get(entry.value.name)?.bait;
                if (!bait) return null;
                const interactions = value.blocks.flatMap((block) => block.text?.match(/💛/gu) ?? []).length;
                return <div key={value.title}>{section(contentText(value.title), <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {t("map.enshrouded.animalTaming.bait")}</p>
                  <EnshroudedLootRows rows={[{ name: bait, target: { page: bait, catalog: "crafting" } }]}
                    onOpenEntry={onOpenEntry} />
                  {interactions > 0 && <p className="text-xs text-zinc-300">
                    {t("map.enshrouded.animalTaming.petInteractions", { value: interactions })}</p>}
                </div>)}</div>;
              }
              if (isAnimal && value.title === "Produce") {
                const description = value.blocks.map((block) => block.text ?? "").join(" ");
                const interval = description.match(/every\s+(~?\d+)\s+minutes?/i)?.[1];
                const capacity = description.match(/hold up to [^(]*\((\d+)\)/i)?.[1];
                return <div key={value.title}>{section(contentText(value.title), <div className="space-y-2">
                  {renderBlocks(value.blocks.filter((block) => block.kind === "table"))}
                  {contentText((interval || capacity) && <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                    {contentText(interval && <span>{t("map.enshrouded.animalProduce.interval", { value: interval })}</span>)}
                    {contentText(capacity && <span>{t("map.enshrouded.animalProduce.capacity", { value: capacity })}</span>)}
                  </p>)}
                </div>)}</div>;
              }
              if (isAnimal && value.title === "Breeding") {
                const offspring = offspringFrom(value.blocks);
                if (!offspring) return null;
                const bed = animalGuides.get(entry.value.name)?.bed;
                return <div key={value.title}>{section(contentText(value.title), <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {t("map.enshrouded.animalBreeding.provide")}</p>
                      <EnshroudedLootRows rows={[
                        { name: entry.value.name, quantity: 2, target: { page: entry.value.id, catalog: "progression" } },
                        ...(bed ? [{ name: bed, quantity: 1, target: { page: bed, catalog: "crafting" } }] : []),
                      ]} onOpenEntry={onOpenEntry} />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {t("map.enshrouded.animalBreeding.mayGet")}</p>
                      <EnshroudedLootRows rows={[{ name: offspring.page,
                        target: { page: offspring.page, catalog: "progression" } }]} onOpenEntry={onOpenEntry} />
                    </div>
                  </div>)}</div>;
              }
              return <div key={value.title}>{section(contentText(value.title), renderBlocks(value.blocks),
                listedDrops || undefined, quest && value.title === firstQuestSection)}</div>;
            }
            const rewardCells = value.blocks.flatMap((block) => block.kind === "list"
              ? block.items?.filter((cell) => /^Reward\s*:/i.test(cell.text)) ?? [] : []);
            const objectiveBlocks = value.blocks.flatMap((block) => {
              if (block.kind !== "list") return [block];
              const items = block.items?.filter((cell) => !/^Reward\s*:/i.test(cell.text)) ?? [];
              return items.length ? [{ ...block, items }] : [];
            });
            return <div key={value.title} className="space-y-4">
              {objectiveBlocks.length > 0 && section(contentText(value.title), renderBlocks(objectiveBlocks),
                undefined, quest && value.title === firstQuestSection)}
              {rewardCells.length > 0 && section(t("map.enshrouded.locationGuide.completionReward"),
                <EnshroudedLootRows rows={rewardCells.flatMap((cell) => rewardRows(cell.text, cell.links ?? []))}
                  onOpenEntry={onOpenEntry} />)}
            </div>;
          })}
        {contentText(entry.value.role && (() => {
          const role = entry.value.role.replace(/ Assistant$/, "");
          const all = crafting.recipes.filter((recipe) => recipe.stations.includes(role));
          const filtered = all.filter((recipe) => key(recipe.output.name).includes(key(recipeQuery)));
          return all.length ? section(t("map.enshrouded.characterRecipes", { count: all.length }), <>
            {all.length > 20 && <input type="search" value={recipeQuery} onChange={(event) => {
              setRecipeQuery(event.target.value); setVisibleRecipeCount(12);
            }}
              placeholder={t("map.enshrouded.searchRecipes")} aria-label={t("map.enshrouded.searchRecipes")}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-white outline-none focus:border-accent" />}
            <div className="grid gap-1.5">{filtered.slice(0, visibleRecipeCount)
              .map((recipe) => entryCard(recipe.output.name, undefined, recipe.output.quantity, "crafting"))}</div>
            {filtered.length > visibleRecipeCount && <button type="button" onClick={() => setVisibleRecipeCount((count) => count + 24)}
              className="w-full rounded-md border border-border py-2 text-xs text-accent hover:border-accent/50 hover:bg-accent-soft hover:text-white">
              {t("map.enshrouded.showMore", { count: filtered.length - visibleRecipeCount })}</button>}
          </>) : null;
        })())}
      </>}
      {entry.kind === "bestiary" && <>
        {contentText(entry.value.overview && <p className="text-xs leading-relaxed text-zinc-300">{contentText(entry.value.overview)}</p>)}
        <EnshroudedBestiaryMarkerContent article={entry.value.wikiArticle} onOpenEntry={onOpenEntry} />
      </>}
      {entry.kind === "wiki" && <>
        <EnshroudedEffects facts={wikiFacts} />
        {wikiSummaryFacts.length > 0 && <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {wikiSummaryFacts.map((fact) => <div key={fact.name} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{fact.name}</dt>
            <dd className="mt-1 text-xs text-zinc-200">{contentText(fact.value)}</dd>
          </div>)}
        </dl>}
        {contentText(entry.value.description && <p className={weapon
          ? "border-l-2 border-accent/50 pl-3 text-xs leading-relaxed text-zinc-300"
          : "text-xs leading-relaxed text-zinc-300"}>{prose(entry.value.description)}</p>)}
        {weapon && <EnshroudedWeaponStats facts={entry.value.stats} />}
        {!weapon && wikiFacts.filter((fact) => !isEffectFact(fact) && !isDurationFact(fact)).map((fact) => <div key={fact.name} className="text-xs">
          <span className="text-zinc-500">{contentText(fact.name)}: </span><span className="text-zinc-200">{contentText(fact.value)}</span></div>)}
        {hasMeaningfulObtainingText(entry.value.obtaining)
          && section(t("map.enshrouded.obtaining"), <EnshroudedAcquisition
            value={entry.value.obtaining} name={name} onOpenEntry={onOpenEntry}
            onOpenMap={(markerId) => onOpenMap(DEFAULT_MAP_ID, markerId)} />)}
        {entry.value.recipes.map((recipe, index) => <div key={index}>{section(t("map.enshrouded.recipe"),
          recipeDetails(recipe.ingredients, recipe.workstations, recipe.craftTime, recipe.productQuantity))}</div>)}
      </>}
      {entry.kind === "building" && <>
        {contentText(entry.value.description && <p className="text-xs leading-relaxed text-zinc-300">{prose(entry.value.description)}</p>)}
        {buildingObtaining && section(t("map.enshrouded.obtaining"),
          <EnshroudedObtainingText value={buildingObtaining.text}
            render={(text) => buildingObtaining.source === "article" ? prose(text)
              : linkedText(text, buildingObtaining.links)} />)}
        {entry.value.recipe?.status === "listed" && section(t("map.enshrouded.recipe"),
          recipeDetails(entry.value.recipe.ingredients ?? [], entry.value.recipe.workstations ?? [],
            entry.value.recipe.craftTime, entry.value.recipe.products?.[0]?.quantity))}
      </>}
      {entry.kind === "crafting" && <>
        {contentText(entry.value?.description && <p className="text-xs leading-relaxed text-zinc-300">{prose(entry.value.description)}</p>)}
        {contentText(craftingObtaining && section(t("map.enshrouded.obtaining"), <EnshroudedAcquisition
          value={craftingObtaining} name={name} onOpenEntry={onOpenEntry}
          onOpenMap={(markerId) => onOpenMap(DEFAULT_MAP_ID, markerId)} />))}
        {contentText(entry.value?.biomes && <p className="text-xs text-zinc-400">{contentText(entry.value.biomes)}</p>)}
        {entry.recipes.map((recipe) => <div key={recipe.id}>{section(t("map.enshrouded.recipe"),
          recipeDetails(recipe.ingredients, recipe.stations, recipe.craftTime, recipe.output.quantity))}</div>)}
      </>}
      {mapPlaces.length > 0 && section(exactPlaces ? t("map.enshrouded.verifiedMarkers")
        : t("map.enshrouded.listedMapPlaces"), <>
        <div className="grid gap-1.5">{mapPlaces.slice(0, visibleLocationCount).map((place) =>
          <button key={place.id} type="button" onClick={() => onOpenMap(DEFAULT_MAP_ID, place.id)}
            className="flex min-h-10 w-full items-center gap-2 rounded-md border border-border bg-white/[0.025] px-2.5 py-2 text-left text-xs text-zinc-200 hover:border-accent/50 hover:bg-accent-soft hover:text-white">
            <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{contentText(place.name)}</span><ChevronRight size={13} className="text-accent/60" />
          </button>)}</div>
        {mapPlaces.length > visibleLocationCount && <button type="button"
          onClick={() => setVisibleLocationCount((count) => count + 16)}
          className="w-full rounded-md border border-border py-2 text-xs text-accent hover:border-accent/50 hover:bg-accent-soft hover:text-white">
          {t("map.enshrouded.showMore", { count: mapPlaces.length - visibleLocationCount })}</button>}
      </>)}
    </div>
  </div>;
}
