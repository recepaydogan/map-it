import pages from "../../../public/data/enshrouded/progression-page-index.json";

export const PROGRESSION_NAVIGATION_EVENT = "enshrouded:open-progression";
export const PROGRESSION_CATALOGS = ["quests", "sets", "npcs"] as const;
export type ProgressionCatalog = typeof PROGRESSION_CATALOGS[number];

const normalize = (name: string) => name.replaceAll("_", " ").trim().toLocaleLowerCase("en");
const known = new Map<string, string>();
const catalogs = new Map<string, ProgressionCatalog>();
for (const quest of pages.quests) {
  known.set(normalize(quest.id), quest.id);
  known.set(normalize(quest.name), quest.id);
  catalogs.set(quest.id, "quests");
}
for (const npc of pages.npcs) {
  for (const name of [npc.id, npc.name, npc.role]) known.set(normalize(name), npc.id);
  catalogs.set(npc.id, "npcs");
}
for (const set of pages.sets) {
  known.set(normalize(set.id), set.id);
  if (!known.has(normalize(set.name))) known.set(normalize(set.name), set.id);
  catalogs.set(set.id, "sets");
}
for (const item of pages.setItems) {
  if (!known.has(normalize(item.id))) known.set(normalize(item.id), item.id);
  if (!known.has(normalize(item.name))) known.set(normalize(item.name), item.id);
  catalogs.set(item.id, "sets");
}

export const findProgressionPage = (name: string | null | undefined): string | undefined =>
  name ? known.get(normalize(name)) : undefined;
export const hasProgressionPage = (name: string | null | undefined): boolean =>
  Boolean(findProgressionPage(name));
export const progressionCatalogForPage = (name: string | null | undefined): ProgressionCatalog | undefined => {
  const page = findProgressionPage(name);
  return page ? catalogs.get(page) : undefined;
};
