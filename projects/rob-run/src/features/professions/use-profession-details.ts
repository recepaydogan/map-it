import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ProfessionSourceRecipe {
  s: number;
  n: string;
  ic?: number;
  make?: [number, number];
  r?: [number, number][];
  req?: number;
  rl?: number;
  tier?: number;
  chg?: string[];
  src?: { items?: number[]; vendors?: number[]; trainer?: { cost?: number; classic?: number }; auto?: number };
}

export interface ProfessionTrainer {
  npc?: number;
  markerId?: string;
  n: string;
  sub?: string;
  side?: string;
  zone?: string;
  x?: number;
  y?: number;
  top?: number;
  fv?: number;
}

export interface ProfessionDetails {
  version: 1;
  recipes: ProfessionSourceRecipe[];
  trainers: ProfessionTrainer[];
  items: Record<string, [string, number, number]>;
  classicRecipeTrainers?: Record<string, number[]>;
  classicTrainerNames?: Record<string, string>;
}

const requests = new Map<string, Promise<ProfessionDetails>>();
let mapTrainersRequest: Promise<(ProfessionTrainer & { profession: string })[]> | null = null;
let classicTrainersRequest: Promise<{ npcs: Record<string, string>; professions: Record<string, Record<string, number[]>> }> | null = null;
const loadClassicTrainers = () => {
  if (!classicTrainersRequest) classicTrainersRequest = fetch(contentUrl("data/professions/classic-recipe-trainers.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Classic recipe trainers: HTTP ${response.status}`);
      const value = await response.json() as { version: number; npcs: Record<string, string>; professions: Record<string, Record<string, number[]>> };
      if (value.version !== 1 || !value.npcs || !value.professions) throw new Error("Invalid Classic recipe trainers");
      return value;
    }).catch((error: unknown) => {
      classicTrainersRequest = null;
      console.error("Failed to load Classic recipe trainers", error);
      return { npcs: {}, professions: {} };
    });
  return classicTrainersRequest;
};
const loadMapTrainers = () => {
  if (!mapTrainersRequest) mapTrainersRequest = fetch(contentUrl("data/professions/map-trainers.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Map trainers: HTTP ${response.status}`);
      const value = await response.json() as { version: number; trainers: (ProfessionTrainer & { profession: string })[] };
      if (value.version !== 1 || !Array.isArray(value.trainers)) throw new Error("Invalid map trainers");
      return value.trainers;
    }).catch((error: unknown) => {
      mapTrainersRequest = null;
      console.error("Failed to load map trainers", error);
      return [];
    });
  return mapTrainersRequest;
};
const load = (id: string) => {
  if (!requests.has(id)) requests.set(id, fetch(contentUrl(`data/professions/details/${id}.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Profession details: HTTP ${response.status}`);
    const value = await response.json() as ProfessionDetails;
    if (value.version !== 1 || !Array.isArray(value.recipes) || !Array.isArray(value.trainers)) throw new Error("Invalid profession details");
    return value;
  }).then(async (details) => {
    const [mapTrainers, classicTrainers] = await Promise.all([loadMapTrainers(), loadClassicTrainers()]);
    const knownNames = new Set(details.trainers.map((trainer) => trainer.n.toLocaleLowerCase()));
    return { ...details, trainers: [...details.trainers, ...mapTrainers.filter((trainer) =>
      trainer.profession === id && !knownNames.has(trainer.n.toLocaleLowerCase()))],
      classicRecipeTrainers: classicTrainers.professions[id] ?? {}, classicTrainerNames: classicTrainers.npcs };
  }).catch((error: unknown) => { requests.delete(id); throw error; }));
  return requests.get(id)!;
};

export const useProfessionDetails = (id: string) => {
  const [state, setState] = useState<{ id: string; data: ProfessionDetails | null; error: boolean }>({ id: "", data: null, error: false });
  useEffect(() => {
    if (id === "camping") return;
    let active = true;
    void load(id).then((data) => { if (active) setState({ id, data, error: false }); }).catch((error: unknown) => {
      console.error("Failed to load profession details", error);
      if (active) setState({ id, data: null, error: true });
    });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? { data: state.data, error: state.error } : { data: null, error: false };
};
