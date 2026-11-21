import { contentUrl } from "../../lib/content-url";
import { useAppLanguage } from "../../i18n/app-language";
import { useEffect, useState } from "react";
import { fetchSupplementalLocalePack } from "../../i18n/locale-content";
import { localizeClassCatalog, type ClassCatalogLocalePack } from "./class-catalog-localization";
import type { ClassCatalog } from "./class-types";

type State = { status: "loading" } | { status: "ready"; catalog: ClassCatalog } | { status: "error" };

let sourceRequest: Promise<ClassCatalog> | null = null;
const localeRequests = new Map<string, Promise<ClassCatalog>>();

const loadSource = () => {
  sourceRequest ??= fetch(contentUrl(`data/classes/catalog.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Class catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") throw new Error("Class catalog has an invalid format");
    const catalog = value as Partial<ClassCatalog>;
    if (catalog.version !== 1 || !Array.isArray(catalog.classes) || catalog.classes.length !== 9
      || catalog.classes.some((entry) => !entry.id || !entry.name || entry.trees?.length !== 3)) {
      throw new Error("Class catalog has an invalid format");
    }
    return catalog as ClassCatalog;
  }).catch((error: unknown) => { sourceRequest = null; throw error; });
  return sourceRequest;
};

const load = (language: string) => {
  if (language === "en") return loadSource();
  let request = localeRequests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchSupplementalLocalePack<ClassCatalogLocalePack>(
      `data/classes/locales/${language}.json`)]).then(([catalog, pack]) => localizeClassCatalog(catalog, pack))
      .catch(() => { localeRequests.delete(language); return loadSource(); });
    localeRequests.set(language, request);
  }
  return request;
};

export const useClassCatalog = (): State => {
  const language = useAppLanguage();
  const [state, setState] = useState<{ language: string; value: State }>({ language: "", value: { status: "loading" } });
  useEffect(() => {
    let cancelled = false;
    load(language).then((catalog) => {
      if (!cancelled) setState({ language, value: { status: "ready", catalog } });
    }).catch((error: unknown) => {
      console.error("Failed to load class catalog", error);
      if (!cancelled) setState({ language, value: { status: "error" } });
    });
    return () => { cancelled = true; };
  }, [language]);
  return state.language === language ? state.value : { status: "loading" };
};
