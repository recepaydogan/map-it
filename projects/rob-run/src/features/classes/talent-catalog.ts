import { contentUrl } from "../../lib/content-url";
import { fetchSupplementalLocalePack } from "../../i18n/locale-content";
import type { CalculatorClass } from "./talent-calculator";
import { localizeTalentCatalog, type TalentCatalogLocalePack } from "./talent-catalog-localization";

let catalogRequest: Promise<{ sourceBuild: string; classes: CalculatorClass[] }> | null = null;
const localeRequests = new Map<string, Promise<CalculatorClass[]>>();

function loadSource() {
  catalogRequest ??= fetch(contentUrl("data/classes/talent-calculator.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Talent data: HTTP ${response.status}`);
    const payload = await response.json() as { version: number; sourceBuild: string; classes: CalculatorClass[] };
    const classes = payload.classes;
    if (payload.version !== 1 || !payload.sourceBuild || !Array.isArray(classes) ||
      !classes.every((entry) => entry.n && entry.trees?.length === 3)) throw new Error("Invalid talent data");
    return { sourceBuild: payload.sourceBuild, classes };
  }).catch((error: unknown) => { catalogRequest = null; throw error; });
  return catalogRequest;
}

export function loadTalentCatalog(language = "en"): Promise<CalculatorClass[]> {
  if (language === "en") return loadSource().then(({ classes }) => classes);
  let request = localeRequests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchSupplementalLocalePack<TalentCatalogLocalePack>(
      `data/classes/locales/talents-${language}.json`)]).then(([source, pack]) =>
      localizeTalentCatalog(source.classes, source.sourceBuild, language, pack))
      .catch(() => {
        localeRequests.delete(language);
        return loadSource().then(({ classes }) => classes);
      });
    localeRequests.set(language, request);
  }
  return request;
}
