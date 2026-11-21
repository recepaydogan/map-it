import type { MapCharacterResistance } from "./types";

export const isMapCharacterVulnerability = ({ value }: MapCharacterResistance) =>
  value.includes("Vulnerable");

export const isMapCharacterImmunity = ({ value }: MapCharacterResistance) =>
  value.includes("Immune");

export const groupMapCharacterResistances = (resistances: MapCharacterResistance[]) => {
  const groups = new Map<string, string[]>();
  for (const resistance of resistances) {
    const types = groups.get(resistance.value) ?? [];
    types.push(resistance.type);
    groups.set(resistance.value, types);
  }
  return [...groups.entries()].map(([value, types]) => ({ value, types }));
};
