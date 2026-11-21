import rawCatalog from "../../../public/data/enshrouded/building-catalog.json";
import materialLocations from "../../../public/data/enshrouded/material-locations.json";

export interface BuildingLink { page: string; label: string; markerId?: string; pageAvailable?: boolean }
export interface BuildingRecipePart { name: string; quantity: number; page?: string }
export interface BuildingRecord {
  id: string;
  name: string;
  sourceCatalog: string;
  group: string;
  set: string | null;
  type: string | null;
  rarity: string | null;
  stackSize: number | null;
  level: number | null;
  biomes: string | null;
  description: string | null;
  obtainingText: string | null;
  availability: { text: string; links: BuildingLink[] } | null;
  recipe: { status: string; ingredients?: BuildingRecipePart[];
    workstations?: string[]; craftTime?: string | null; products?: BuildingRecipePart[] };
  icon: { path: string } | null;
  appearance: { path: string } | null;
  sourcePage: string;
}

const verifiedObtaining: Record<string, string> = {
  "Fertilised Farm Soil": "Unlock the recipe by obtaining Sand, then craft it at the Farmer.",
  Ice: "Mine ice in the Albaneve Summits.",
  Snow: "Mine snow in the Albaneve Summits.",
};

export function hasMeaningfulObtainingText(value: string | null | undefined): value is string {
  if (!value) return false;
  const visible = value.replace(/\{\{\s*DataQuery\/[^{}]*\}\}/gi, "").trim();
  return Boolean(visible && !/^(?:n\/a|tba|unknown|[-?]+)$/i.test(visible));
}

export function getBuildingObtaining(record: Pick<BuildingRecord, "name" | "obtainingText" | "availability">):
  { text: string; links: BuildingLink[]; source: "article" | "verified" | "index" } | null {
  if (hasMeaningfulObtainingText(record.obtainingText))
    return { text: record.obtainingText, links: [], source: "article" };
  const verified = verifiedObtaining[record.name];
  if (verified) return { text: verified, links: [], source: "verified" };
  const indexText = record.availability?.text;
  if (!hasMeaningfulObtainingText(indexText)) return null;
  return {
    text: /^Obtaining\s+/i.test(indexText)
      ? `Unlock the recipe by obtaining ${indexText.replace(/^Obtaining\s+/i, "")}.` : indexText,
    links: record.availability?.links ?? [],
    source: "index",
  };
}

export const BUILDING_CATALOG = rawCatalog as unknown as {
  schemaVersion: number;
  records: BuildingRecord[];
  relatedRecords: BuildingRecord[];
};
export const BUILDING_RECORDS = [...BUILDING_CATALOG.records, ...BUILDING_CATALOG.relatedRecords];
const normalize = (name: string) => decodeURIComponent(name.replace(/_/g, " ")).trim().toLocaleLowerCase("en");
export const BUILDING_BY_PAGE = new Map(BUILDING_RECORDS.map((record) => [normalize(record.sourcePage), record]));
export const findBuildingPage = (name: string | null | undefined): BuildingRecord | undefined =>
  name ? BUILDING_BY_PAGE.get(normalize(name))
    ?? (normalize(name) === "copper bar" ? BUILDING_BY_PAGE.get("copper bars") : undefined) : undefined;

const usedIn = new Map<string, BuildingRecord[]>();
for (const record of BUILDING_CATALOG.records) {
  for (const part of record.recipe.ingredients ?? []) {
    const page = normalize(part.page ?? part.name);
    usedIn.set(page, [...(usedIn.get(page) ?? []), record]);
  }
  for (const station of record.recipe.workstations ?? []) {
    const page = normalize(station);
    usedIn.set(page, [...(usedIn.get(page) ?? []), record]);
  }
}
export const buildingUsedIn = (record: BuildingRecord) =>
  [...new Map((usedIn.get(normalize(record.sourcePage)) ?? []).map((entry) => [entry.id, entry])).values()];
export const buildingMapLocations = (record: BuildingRecord): { id: string; name: string }[] =>
  (materialLocations as Record<string, { id: string; name: string }[]>)[record.sourcePage] ?? [];
