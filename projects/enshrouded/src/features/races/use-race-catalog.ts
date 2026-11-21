import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { RaceCatalog } from "./race-types";

type State = { status: "loading" } | { status: "ready"; catalog: RaceCatalog } | { status: "error" };

let request: Promise<RaceCatalog> | null = null;

const load = () => {
  request ??= fetch(contentUrl(`data/races/catalog.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Race catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") throw new Error("Race catalog has an invalid format");
    const catalog = value as Partial<RaceCatalog>;
    if (catalog.version !== 1 || !Array.isArray(catalog.races) || catalog.races.length !== 9
      || catalog.races.some((race) => !race.id || !race.name || !Array.isArray(race.racials)
        || !Array.isArray(race.classes) || !Array.isArray(race.exclusiveAbilities)
        || race.racials.length !== race.racialCount || race.classes.length !== race.classCount)) {
      throw new Error("Race catalog has an invalid format");
    }
    return catalog as RaceCatalog;
  }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useRaceCatalog = (): State => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    load().then((catalog) => {
      if (!cancelled) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      console.error("Failed to load race catalog", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, []);
  return state;
};
