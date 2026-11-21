import wikiObtaining from "../../../public/data/enshrouded/wiki-obtaining-index.json";
import { hasMeaningfulObtainingText } from "../knowledge/building-catalog";

const byPage = new Map(Object.entries(wikiObtaining)
  .map(([page, text]) => [page.replaceAll("_", " ").toLocaleLowerCase("en"), text]));

export function getCraftingObtaining(entry: { page: string; obtaining?: string | null } | null | undefined) {
  if (!entry) return null;
  if (hasMeaningfulObtainingText(entry.obtaining)) return entry.obtaining;
  return byPage.get(entry.page.replaceAll("_", " ").toLocaleLowerCase("en")) ?? null;
}
