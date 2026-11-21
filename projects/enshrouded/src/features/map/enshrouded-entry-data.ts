import progressionCatalog from "../../../public/data/enshrouded/progression-catalog.json";
import wikiCatalog from "../../../public/data/enshrouded/wiki-catalog.json";
import craftingCatalog from "../../../public/data/enshrouded/crafting-catalog.json";
import buildingCatalog from "../../../public/data/enshrouded/building-catalog.json";
import bestiaryCatalog from "../../../public/data/enshrouded/bestiary-catalog.json";

export interface EnshroudedEntryTarget { page: string; catalog?: string }
export type ContentLink = { page: string; label: string; markerId?: string };
type ContentCell = { text: string; links: ContentLink[] };
export type ContentBlock = { kind: "text" | "list" | "table"; text?: string; links?: ContentLink[];
  items?: ContentCell[]; headers?: string[]; rows?: ContentCell[][] };
type ContentSection = { title: string; blocks: ContentBlock[] };
type Fact = { name: string; value: string; links: ContentLink[] };
type ProgressionEntry = { id: string; name: string; group: string; role?: string; image?: string | null;
  description?: string | null; facts?: Fact[]; sections?: ContentSection[];
  reward?: string; declaredCount?: string; items?: { name: string; page: string; image?: string | null }[] };
type WikiEntry = { id: string; name: string; catalog: string; icon: string | null; description: string | null;
  type: string | null; rarity: string | null; level: string | null; obtaining: string | null;
  stackSize?: string | null; comfort?: string | null;
  related: string[];
  attributes: { name: string; value: string }[]; stats: { name: string; value: string }[];
  recipes: { ingredients: { name: string; quantity: string | null }[]; workstations: string[];
    craftTime: string | null; productQuantity: string | null }[] };
type BuildingEntry = { sourcePage: string; name: string; type: string | null; rarity: string | null;
  description: string | null; obtainingText: string | null; icon: { path: string } | null;
  availability: { text: string; links: ContentLink[] } | null;
  recipe: { status: string; ingredients?: { name: string; quantity: number }[]; workstations?: string[];
    craftTime?: string | null; products?: { name: string; quantity: number }[] } | null };
type CraftingEntry = { name: string; page: string; description: string | null; imagePath: string | null;
  type: string | null; rarity: string | null; obtaining: string | null; biomes: string | null };
type Recipe = { id: string; output: { name: string; quantity: number };
  ingredients: { name: string; quantity: number }[]; stations: string[]; craftTime: string | null };
type BestiaryEntry = { name: string; wikiArticle: string; image: string | null; faction: string;
  role: "boss" | "enemy"; overview: string | null };
type ResolvedEntry =
  | { kind: "progression"; value: ProgressionEntry }
  | { kind: "wiki"; value: WikiEntry }
  | { kind: "building"; value: BuildingEntry }
  | { kind: "bestiary"; value: BestiaryEntry }
  | { kind: "crafting"; value: CraftingEntry | null; recipes: Recipe[]; name: string };

const progression = progressionCatalog as unknown as { npcs: ProgressionEntry[]; quests: ProgressionEntry[];
  setItems: ProgressionEntry[]; sets: ProgressionEntry[] };
const wiki = (wikiCatalog as { records: WikiEntry[] }).records;
const building = (buildingCatalog as unknown as { records: BuildingEntry[] }).records;
const bestiary = (bestiaryCatalog as unknown as { records: BestiaryEntry[] }).records;
export const crafting = craftingCatalog as unknown as { materials: CraftingEntry[]; items: CraftingEntry[];
  stations: CraftingEntry[]; recipes: Recipe[] };
export const ENSHROUDED_QUEST_ICON = progressionCatalog.questIcon;
export const isEnshroudedQuest = (entry: { id: string }) => entry.id.startsWith("Quests/");
export const getEnshroudedProgressionImage = (entry: {
  image?: string | null; items?: { name: string; image?: string | null }[]
}): string | null =>
  entry.image ?? entry.items?.find((item) => /showcase/i.test(item.name) && item.image)?.image
    ?? entry.items?.find((item) => item.image)?.image ?? null;
export const key = (name: string) => name.replaceAll("_", " ").toLocaleLowerCase("en");
export const sameEnshroudedEntryTarget = (a: EnshroudedEntryTarget | undefined, b: EnshroudedEntryTarget) =>
  !!a && a.catalog === b.catalog && key(a.page) === key(b.page);
const progressionEntries = [...progression.npcs, ...progression.quests, ...progression.setItems, ...progression.sets];
const progressionById = new Map(progressionEntries.map((entry) => [key(entry.id), entry]));
const progressionByName = new Map(progressionEntries.map((entry) => [key(entry.name), entry]));
const wikiById = new Map(wiki.map((entry) => [key(entry.id), entry]));
const bestiaryByArticle = new Map(bestiary.map((entry) => [key(entry.wikiArticle), entry]));
const buildingByPage = new Map(building.map((entry) => [key(entry.sourcePage), entry]));
const craftingByPage = new Map([...crafting.items, ...crafting.materials, ...crafting.stations]
  .map((entry) => [key(entry.page), entry] as const));
const recipesByOutput = new Map<string, Recipe[]>();
for (const recipe of crafting.recipes) {
  const output = key(recipe.output.name);
  recipesByOutput.set(output, [...(recipesByOutput.get(output) ?? []), recipe]);
}

export function resolveEnshroudedEntry({ page, catalog }: EnshroudedEntryTarget): ResolvedEntry | null {
  const normalized = key(page);
  const progressionEntry = progressionById.get(normalized) ?? progressionByName.get(normalized);
  const wikiEntry = wikiById.get(normalized);
  const bestiaryEntry = bestiaryByArticle.get(normalized);
  const buildingEntry = buildingByPage.get(normalized);
  const candidate = craftingByPage.get(normalized);
  const craftingEntry = candidate && (candidate.description || candidate.obtaining || candidate.imagePath
    || candidate.type || candidate.rarity || candidate.biomes) ? candidate : undefined;
  const recipes = recipesByOutput.get(normalized) ?? [];
  if (catalog === "progression" && progressionEntry) return { kind: "progression", value: progressionEntry };
  if (catalog === "wiki" && wikiEntry) return { kind: "wiki", value: wikiEntry };
  if (catalog === "bestiary" && bestiaryEntry) return { kind: "bestiary", value: bestiaryEntry };
  if (catalog === "building" && buildingEntry) return { kind: "building", value: buildingEntry };
  if (catalog === "crafting" && (craftingEntry || recipes.length))
    return { kind: "crafting", value: craftingEntry ?? null, recipes, name: craftingEntry?.name ?? page };
  if (progressionEntry) return { kind: "progression", value: progressionEntry };
  if (buildingEntry) return { kind: "building", value: buildingEntry };
  if (wikiEntry) return { kind: "wiki", value: wikiEntry };
  if (bestiaryEntry) return { kind: "bestiary", value: bestiaryEntry };
  if (craftingEntry || recipes.length)
    return { kind: "crafting", value: craftingEntry ?? null, recipes, name: craftingEntry?.name ?? page };
  return null;
}

export const hasEnshroudedEntry = (target: EnshroudedEntryTarget) => resolveEnshroudedEntry(target) !== null;
