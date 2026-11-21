import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { ClassCatalog } from "./class-types";

type State = { status: "loading" } | { status: "ready"; catalog: ClassCatalog } | { status: "error" };

let request: Promise<ClassCatalog> | null = null;

const load = () => {
  request ??= fetch(contentUrl(`data/classes/catalog.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Class catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") throw new Error("Class catalog has an invalid format");
    const catalog = value as Partial<ClassCatalog>;
    if (catalog.version !== 1 || !Array.isArray(catalog.classes) || catalog.classes.length !== 9
      || catalog.classes.some((entry) => !entry.id || !entry.name || entry.trees?.length !== 3)) {
      throw new Error("Class catalog has an invalid format");
    }
    return catalog as ClassCatalog;
  }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useClassCatalog = (): State => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    load().then((catalog) => {
      if (!cancelled) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      console.error("Failed to load class catalog", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, []);
  return state;
};
