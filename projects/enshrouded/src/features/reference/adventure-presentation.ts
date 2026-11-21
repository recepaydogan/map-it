import type { TFunction } from "i18next";
import type { ReferenceFact, ReferenceSummary } from "./reference-types";

export interface AdventureFamily { id: string; name: string; variants: ReferenceSummary[] }
const KIND_ORDER = ["story", "regional", "exploration", "profession", "mission", "scroll", "party", "raid", "daily", "growth", "awakening", "ascension", "seal", "stronghold", "challenge", "progression", "other"];
const DIFFICULTY_ORDER = ["easy", "normal", "hard", "advanced", "extreme", "despair", "hell", "none"];

export function adventureFamilies(entries: ReferenceSummary[]): AdventureFamily[] {
  const families = new Map<string, AdventureFamily>();
  for (const entry of entries) {
    const id = entry.adventure?.familyId ?? entry.id;
    const family = families.get(id) ?? { id, name: entry.name, variants: [] };
    family.variants.push(entry);
    families.set(id, family);
  }
  for (const family of families.values()) family.variants.sort((a, b) =>
    (a.adventure?.level ?? 0) - (b.adventure?.level ?? 0)
    || DIFFICULTY_ORDER.indexOf(a.adventure?.difficulty ?? "none") - DIFFICULTY_ORDER.indexOf(b.adventure?.difficulty ?? "none")
    || (a.adventure?.tier ?? 0) - (b.adventure?.tier ?? 0) || a.id.localeCompare(b.id));
  return [...families.values()].sort((a, b) =>
    KIND_ORDER.indexOf(a.variants[0]?.adventure?.kind ?? "other") - KIND_ORDER.indexOf(b.variants[0]?.adventure?.kind ?? "other")
    || (a.variants[0]?.adventure?.level ?? 0) - (b.variants[0]?.adventure?.level ?? 0) || a.name.localeCompare(b.name));
}

export function adventureKind(entry: ReferenceSummary, t: TFunction): string {
  return t(`reference.adventure.kinds.${entry.adventure?.kind ?? "other"}`);
}

export function adventureVariant(entry: ReferenceSummary, t: TFunction): string {
  const data = entry.adventure;
  if (!data) return entry.name;
  return [
    data.difficulty && data.difficulty !== "none" ? t(`reference.adventure.difficulties.${data.difficulty}`) : "",
    data.tier ? t("reference.adventure.tier", { number: data.tier }) : "",
    data.faction !== "All" ? t(`reference.adventure.factions.${data.faction}`) : "",
    data.level ? t("reference.adventure.level", { number: data.level }) : "",
    data.region,
  ].filter(Boolean).join(" · ") || t("reference.adventure.baseVariant");
}

export function adventureFacts(facts: ReferenceFact[], t: TFunction): ReferenceFact[] {
  return facts.filter((fact) => fact.value !== "None" && fact.value !== 0).map((fact) => {
    if (fact.label === "reference.labels.faction") return { ...fact, value: t(`reference.adventure.factions.${fact.value}`) };
    if (fact.label === "reference.labels.difficulty") return { ...fact, value: t(`reference.adventure.difficulties.${String(fact.value).toLowerCase()}`) };
    if (fact.label === "reference.labels.repeat-cycle") return { ...fact, value: t(`reference.adventure.repeat.${String(fact.value).toLowerCase()}`, { defaultValue: String(fact.value) }) };
    return fact;
  });
}
