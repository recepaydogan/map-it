import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { ProfessionCatalog } from "./profession-types";

type State = { status: "loading" } | { status: "ready"; catalog: ProfessionCatalog } | { status: "error" };

let request: Promise<ProfessionCatalog> | null = null;

const load = () => {
  request ??= fetch(contentUrl(`data/professions/catalog.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Profession catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") throw new Error("Profession catalog has an invalid format");
    const catalog = value as Partial<ProfessionCatalog>;
    if (catalog.version !== 1 || !Array.isArray(catalog.professions) || catalog.professions.length !== 13
      || catalog.professions.some((entry) => !entry.id || !entry.name || !Array.isArray(entry.recipes)
        || entry.recipes.length !== entry.recipeCount)) {
      throw new Error("Profession catalog has an invalid format");
    }
    return catalog as ProfessionCatalog;
  }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useProfessionCatalog = (): State => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    load().then((catalog) => {
      if (!cancelled) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      console.error("Failed to load profession catalog", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, []);
  return state;
};
