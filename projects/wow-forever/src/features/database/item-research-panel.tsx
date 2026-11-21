import { useTranslation } from "react-i18next";
import { useMemo, type ReactNode } from "react";
import { Box, ChevronRight, Globe, ScrollText, Skull, Store, Swords } from "lucide-react";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import ProgressiveList from "../../components/progressive-list";
import Tooltip from "../../components/tooltip";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useProfessionCatalog } from "../professions/use-profession-catalog";
import type { ProfessionRecipe } from "../professions/profession-types";
import DatabaseSectionTitle from "./database-section-title";
import ItemIcon from "./item-icon";
import ItemQuestRewards from "./item-quest-rewards";
import ItemTooltipContent from "./item-tooltip-content";
import type { DatabaseItem } from "./item-database-types";
import type { ItemCraftingRecord, ItemResearch, ItemSourceRecord } from "./use-item-research";
import type { ForeverQuestItemReward } from "./use-forever-quest-item-rewards";
import ItemSourceRow from "./item-source-row";
import { getItemSourceArtwork, TREASURE_CHEST_ARTWORK } from "./item-source-artwork";
import { getItemSourceMapLocations } from "./item-source-map-links";
import { useItemSourceMapLinks } from "./use-item-source-map-links";

const thresholdColors = ["text-orange-400", "text-yellow-300", "text-green-400", "text-zinc-400"];

const UsedInRecipes = ({ used, itemsById }: { used: NonNullable<ItemCraftingRecord["used"]>; itemsById: Map<string, DatabaseItem> }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const professionCatalog = useProfessionCatalog();
  const professionName = (id: string) => t(`professions.names.${id.replace("-", "")}`, { defaultValue: id });
  const recipes = useMemo(() => {
    const index = new Map<string, ProfessionRecipe>();
    if (professionCatalog.status === "ready") for (const profession of professionCatalog.catalog.professions) {
      for (const recipe of profession.recipes) if (recipe.itemId) {
        index.set(`${profession.id}:${recipe.itemId}:${recipe.name}`, recipe);
      }
    }
    return index;
  }, [professionCatalog]);

  return <section>
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h4 className="text-[12px] font-semibold text-zinc-100">{t("database.itemResearch.usedIn", { count: used.length })}</h4>
      <span className="hidden px-2 text-[11px] text-subtle @min-[310px]:block">{t("database.itemResearch.reagents")}</span>
    </div>
    <ProgressiveList initialCount={8} pageSize={24} className="divide-y divide-border border-y border-border">{used.map(([profession, spellId, quantity, name, , , output], index) => {
      const resultItem = itemsById.get(String(output));
      const recipe = recipes.get(`${profession}:${output}:${name}`);
      const skill = recipe?.clientSkill ?? recipe?.skill;
      const thresholds = recipe?.skillThresholds ?? [];
      const estimatedSkill = recipe?.clientSkill === undefined && recipe?.estimatedSkill;
      const formatSkill = (level: number, estimated: boolean | undefined) => `${estimated ? "≈" : ""}${level}`;
      const professionLabel = professionName(profession);
      const resultName = resultItem
        ? gameText(resultItem.name, `ItemSparse:${resultItem.id}:4`)
        : gameText(name, `ItemSparse:${output}:4`);
      return <div key={`${spellId}-${index}`} className="grid min-w-0 items-center gap-x-3 gap-y-2 px-2 py-2.5 @min-[310px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className={cn("relative flex min-w-0 flex-col justify-center", resultItem?.icon && "min-h-9 ps-[42px]")}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold leading-5 text-zinc-100">
            {resultItem ? <button type="button"
              onClick={() => openReference({ category: "items", id: resultItem.id, name: resultName })}
              className="max-w-full min-w-0 cursor-pointer rounded-[var(--radius-sm)] text-left wrap-break-word underline-offset-2 hover:underline">
              {resultItem.icon && <span className="absolute start-0 top-1/2 -translate-y-1/2">
                <ItemIcon icon={resultItem.icon} name={resultName} size={32} />
              </span>}
              {resultName}
            </button> : <span className="min-w-0 wrap-break-word">{resultName}</span>}
            {quantity > 1 && <span className="text-[11px] font-normal tabular-nums text-subtle">×{quantity}</span>}
            {recipe?.new && <span className="text-[10px] font-medium text-accent">{t("professions.new")}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] leading-4 tabular-nums text-zinc-300">
            <button type="button" onClick={() => openReference({ category: "professions", id: profession === "first-aid" ? "firstaid" : profession, name: professionLabel })}
              className="min-w-0 cursor-pointer rounded-[var(--radius-sm)] text-left wrap-break-word underline-offset-2 hover:text-zinc-100 hover:underline">
              {professionLabel}{skill !== undefined && skill !== thresholds[0] && <> · {formatSkill(skill, estimatedSkill)}</>}
            </button>
            {thresholds.length > 0 && <span className="flex flex-wrap gap-x-1.5 border-s border-border ps-2 font-medium">
              {thresholds.map((value, threshold) => <span key={threshold} className={thresholdColors[threshold] ?? "text-subtle"}
                title={t(`professions.thresholds.${threshold}`)}>{formatSkill(value, threshold === 0 && skill === value && estimatedSkill)}</span>)}
            </span>}
          </div>
        </div>
        <div role="group" aria-label={t("database.itemResearch.reagents")}
          className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[310px]:max-w-28 @min-[310px]:justify-end @min-[560px]:max-w-52">
          {!recipe && <span className="text-[11px] leading-4 text-subtle">{t("database.itemResearch.recipeDetailsUnavailable")}</span>}
          {recipe?.reagents.map((reagent) => {
            const item = itemsById.get(reagent.id);
            const itemName = gameText(item?.name ?? reagent.name, `ItemSparse:${reagent.id}:4`);
            const label = `${itemName} ×${reagent.quantity}`;
            return item?.icon ? <Tooltip key={reagent.id} wrap align="start" side="top" className="shrink-0" label={<ItemTooltipContent item={item} />}>
              <button type="button" aria-label={label}
                onClick={() => openReference({ category: "items", id: reagent.id, name: itemName })}
                className="relative cursor-pointer rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-accent">
                <ItemIcon icon={item.icon} name={itemName} size={26} />
                <span className="absolute right-0 bottom-0 rounded-tl bg-black/80 px-0.5 text-[10px] font-semibold leading-3 text-white">{reagent.quantity}</span>
              </button>
            </Tooltip> : <span key={reagent.id} title={label} className="min-w-0 wrap-break-word rounded-[var(--radius-sm)] border border-border px-1.5 py-1 text-[11px] text-subtle">{itemName} ×{reagent.quantity}</span>;
          })}
        </div>
      </div>;
    })}</ProgressiveList>
  </section>;
};

const sourceGroups = {
  drop: { title: "database.acquisition.drops", icon: Swords },
  world: { title: "database.itemResearch.worldDrops", icon: Globe },
  quest: { title: "database.questRewards.title", icon: ScrollText },
  vendor: { title: "database.acquisition.merchants", icon: Store },
  object: { title: "database.itemResearch.objects", icon: Box },
  container: { title: "database.itemResearch.containers", icon: Box },
};

const ContainerSourceRow = ({ name, item, onOpen }: {
  name: string;
  item?: DatabaseItem;
  onOpen: (item: DatabaseItem) => void;
}) => {
  const { t } = useTranslation();
  const rowClass = "flex min-h-[42px] w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-start";
  const content = <>
    <ItemIcon icon={item?.icon || TREASURE_CHEST_ARTWORK} name={name} size={26} />
    <span className="min-w-0 flex-1 wrap-break-word text-[13px] font-semibold leading-5 text-zinc-100">{name}</span>
  </>;
  return <div className="border-b border-border last:border-b-0">
    {item ? <button type="button" onClick={() => onOpen(item)} title={t("database.itemResearch.openContainer")}
      className={cn(rowClass, "cursor-pointer hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent")}>
      {content}
      <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
    </button> : <div className={rowClass}>{content}</div>}
  </div>;
};

const ItemResearchPanel = ({ research, itemsById, onOpenMap, craftedFrom, questRewards }: {
  research: ItemResearch | null;
  itemsById: Map<string, DatabaseItem>;
  onOpenMap?: (mapId: string, markerId: string) => void;
  craftedFrom?: ReactNode;
  questRewards: ForeverQuestItemReward[];
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const publishedRewardIds = new Set(questRewards.map(({ questId }) => questId));
  const sources = research?.sources.filter((source) => source.t !== "craft"
    && !(source.t === "vendor" && research.sold?.v.length)
    && !(source.t === "quest" && !source.provided && publishedRewardIds.has(String(source.q)))) ?? [];
  const maps = useItemSourceMapLinks(Boolean(sources.some((source) => ["drop", "quest", "vendor", "object"].includes(source.t)) || research?.sold?.v.length));
  const factionName = (faction?: string) => faction === "a" || faction === "Alliance" ? t("database.itemResearch.alliance")
    : faction === "h" || faction === "Horde" ? t("database.itemResearch.horde") : faction;
  const vendorName = (name: unknown, npc: number | undefined, locations: ReturnType<typeof getItemSourceMapLocations>) => {
    const rawName = typeof name === "string" ? name.trim() : "";
    const resolvedName = rawName && !/^\d+$/.test(rawName) ? rawName : locations.find(({ name }) => name && !/^\d+$/.test(name))?.name;
    return resolvedName ? gameText(resolvedName, npc ? `Creature:${npc}:0` : undefined) : t("database.itemResearch.unknownVendor");
  };
  const sourceName = (source: ItemSourceRecord, locations: ReturnType<typeof getItemSourceMapLocations> = []) => {
    if (source.t === "world") return Array.isArray(source.lv)
      ? t("database.itemResearch.worldDrop", { levels: `${source.lv[0]}–${source.lv[1]}` }) : t("database.itemResearch.worldDropUnknown");
    if (source.t === "vendor" && source.many) return t("database.itemResearch.vendorCount", { count: source.many });
    if (source.t === "vendor") return vendorName(source.n, source.npc, locations);
    if (!source.n) return t("database.itemResearch.unknownCreature");
    if (source.npc) return gameText(source.n, `Creature:${source.npc}:0`);
    if (source.t === "container" && source.item) return gameText(source.n, `ItemSparse:${source.item}:4`);
    return gameText(source.n);
  };
  const formatChance = (pct?: number) => pct !== undefined && Number.isFinite(pct) && pct > 0
    ? (pct / 100).toLocaleString(i18n.language, { style: "percent", maximumSignificantDigits: 3 }) : undefined;
  const resolve = (source: ItemSourceRecord) => getItemSourceMapLocations(source, maps.index);
  const vendors = research?.sold?.v.map((vendor) => ({
    vendor, locations: resolve({ t: "vendor", npc: vendor.npc, mapId: vendor.mapId, markerId: vendor.markerId }),
  })).sort((a, b) => Number(Boolean(b.locations.length)) - Number(Boolean(a.locations.length)));
  const sorted = (records: ItemSourceRecord[]) => [...records].sort((a, b) =>
    Number(Boolean(resolve(b).length)) - Number(Boolean(resolve(a).length))
    || Number(Boolean(b.fv)) - Number(Boolean(a.fv))
    || Number(b.src === "forever") - Number(a.src === "forever"));
  const used = research?.crafting?.used;
  if (!sources.length && !vendors?.length && !used?.length && !craftedFrom && !questRewards.length) return null;

  const renderSources = (type: keyof typeof sourceGroups) => {
    const { title, icon } = sourceGroups[type];
    const records = sorted(sources.filter((source) => source.t === type));
    if (!records.length) return null;
    return <section key={type}>
      <DatabaseSectionTitle count={records.length} className={type === "container" ? "mb-2" : undefined}>
        {t(records.some((source) => source.provided) ? "reference.categories.quests" : title)}
      </DatabaseSectionTitle>
      <ProgressiveList initialCount={6} pageSize={20} className="border-y border-border">{records.map((source, index) => {
        const key = `${source.t}-${source.npc ?? source.item ?? source.q ?? source.n}-${index}`;
        if (type === "container") return <ContainerSourceRow key={key} name={sourceName(source)}
          item={itemsById.get(String(source.item))}
          onOpen={(item) => openReference({ category: "items", id: item.id,
            name: gameText(item.name, `ItemSparse:${item.id}:4`), initialItemTab: "acquisition" })} />;
        const dungeonId = source.inst && research?.index.localDungeons[String(source.inst)];
        const dungeonName = source.inst && research?.index.dungeons[String(source.inst)];
        const localizedDungeonName = dungeonName ? gameText(dungeonName) : undefined;
        const locations = resolve(source);
        const details = [localizedDungeonName,
          source.boss ? t("database.acquisition.boss") : undefined,
          source.t === "quest" && typeof source.lv === "number" ? t("database.itemResearch.level", { level: source.lv }) : undefined,
          source.t === "quest" && source.choice ? t("database.itemResearch.choice") : undefined,
          source.provided ? t("map.foreverQuest.providedOnAccept") : undefined,
          source.t === "quest" && source.side ? factionName(source.side) : undefined,
          maps.index && !locations.length && ["drop", "vendor", "quest", "object"].includes(source.t)
            ? t("database.itemResearch.noMappedLocation") : undefined,
        ].filter(Boolean).join(" · ");
        const reference = dungeonId ? { label: `${t("database.itemResearch.openDungeon")}${localizedDungeonName ? ` · ${localizedDungeonName}` : ""}`,
          open: () => openReference({ category: "dungeons", id: dungeonId, name: localizedDungeonName }) }
          : undefined;
        return <ItemSourceRow key={key}
          name={sourceName(source, locations)} icon={source.boss ? Skull : icon} details={details} locations={locations}
          faction={type === "vendor" ? factionName(source.side) : undefined} mapActionAtEnd={type === "vendor"}
          artwork={getItemSourceArtwork(source, locations)}
          chance={formatChance(source.pct)}
          reference={reference} onOpenMap={onOpenMap} />;
      })}</ProgressiveList>
    </section>;
  };

  return <section className="@container max-w-[760px] space-y-6">
    {maps.loading && <p role="status" className="text-[12px] text-zinc-300">{t("database.itemResearch.loadingLocations")}</p>}
    {maps.error && <p role="alert" className="text-[12px] text-danger-text">{t("database.itemResearch.locationError")}</p>}
    {renderSources("drop")}
    {renderSources("vendor")}
    {!!research?.sold?.v.length && <section>
      <DatabaseSectionTitle count={research.sold.total}>{t("database.acquisition.merchants")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={6} pageSize={24} className="border-y border-border">
        {vendors?.map(({ vendor, locations }) => {
          const details = maps.index && !locations.length ? t("database.itemResearch.noMappedLocation") : undefined;
          return <ItemSourceRow key={vendor.npc} name={vendorName(vendor.n, vendor.npc, locations)} icon={Store}
            artwork={getItemSourceArtwork({ t: "vendor" }, locations)}
            region={vendor.zone ? gameText(vendor.zone) : undefined} faction={factionName(vendor.side)}
            details={details} locations={locations} onOpenMap={onOpenMap} mapActionAtEnd />;
        })}
      </ProgressiveList>
    </section>}
    {craftedFrom}
    <ItemQuestRewards rewards={questRewards} onOpenMap={onOpenMap} />
    {renderSources("quest")}
    {renderSources("object")}
    {!!used?.length && <UsedInRecipes used={used} itemsById={itemsById} />}
    {renderSources("world")}
    {renderSources("container")}
  </section>;
};

export default ItemResearchPanel;
