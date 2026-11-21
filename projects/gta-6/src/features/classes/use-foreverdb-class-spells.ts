import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ForeverDbClassSpell {
  id: string;
  name: string;
  level?: number;
  description: string;
  sourceUrl: string;
}

interface SpellCatalog {
  version: 1;
  entries: Record<string, ForeverDbClassSpell[]>;
}

let cached: SpellCatalog | null = null;
let pending: Promise<SpellCatalog> | null = null;

const loadSpells = () => {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch(contentUrl("data/spells/foreverdb-class-spells.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Class spells: HTTP ${response.status}`);
      const value = await response.json() as SpellCatalog;
      if (value.version !== 1 || !value.entries) throw new Error("Invalid class spell catalog");
      cached = value;
      return value;
    })
    .catch((error: unknown) => { pending = null; throw error; });
  return pending;
};

export const useForeverDbClassSpells = () => {
  const [data, setData] = useState<SpellCatalog | null>(cached);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSpells().then((value) => { if (active) setData(value); }).catch((cause: unknown) => {
      console.error("Failed to load class spells", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);
  return { entries: data?.entries, error };
};
