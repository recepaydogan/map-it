import index from "../../../public/data/enshrouded/crafting-page-index.json";

export const CRAFTING_NAVIGATION_EVENT = "enshrouded:open-crafting";
const names = new Set(index.items.map((name) => name.replace(/_/g, " ").toLocaleLowerCase("en")));
const stations = new Set(index.stations.map((name) => name.replace(/_/g, " ").toLocaleLowerCase("en")));
const materials = new Set(index.materials.map((name) => name.replace(/_/g, " ").toLocaleLowerCase("en")));
export const hasCraftingPage = (name: string | null | undefined) => Boolean(name
  && names.has(name.replace(/_/g, " ").toLocaleLowerCase("en")));
export const craftingSectionFor = (name: string | null | undefined): "stations" | "materials" | null => {
  const key = name?.replace(/_/g, " ").toLocaleLowerCase("en");
  return key && stations.has(key) ? "stations" : key && materials.has(key) ? "materials" : null;
};
