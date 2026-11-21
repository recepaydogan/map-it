import { contentUrl } from "../../lib/content-url";
import type { CalculatorClass } from "./talent-calculator";

let catalogRequest: Promise<CalculatorClass[]> | null = null;

export function loadTalentCatalog() {
  catalogRequest ??= fetch(contentUrl("data/classes/talent-calculator.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Talent data: HTTP ${response.status}`);
    const payload = await response.json() as { version: number; classes: CalculatorClass[] };
    const classes = payload.classes;
    if (payload.version !== 1 || !Array.isArray(classes) || !classes.every((entry) => entry.n && entry.trees?.length === 3)) throw new Error("Invalid talent data");
    return classes;
  }).catch((error: unknown) => { catalogRequest = null; throw error; });
  return catalogRequest;
}
