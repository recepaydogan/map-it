import type { ReferenceSummary } from "./reference-types";

export interface ActivityFamily {
  id: string;
  name: string;
  kind: "event" | "challenge";
  variants: ReferenceSummary[];
}

export function groupActivities(entries: ReferenceSummary[], targetId?: string): ActivityFamily[] {
  const families = new Map<string, ActivityFamily>();
  for (const entry of entries) {
    if (entry.activity?.listed === false && entry.id !== targetId) continue;
    const id = entry.activity?.familyId ?? entry.id;
    const family = families.get(id) ?? { id, name: entry.name, kind: entry.activity?.kind ?? "event", variants: [] };
    family.variants.push(entry);
    families.set(id, family);
  }
  for (const family of families.values()) family.variants.sort((a, b) =>
    (a.activity?.level ?? 0) - (b.activity?.level ?? 0)
    || (a.activity?.region ?? "").localeCompare(b.activity?.region ?? "") || a.id.localeCompare(b.id));
  return [...families.values()].sort((a, b) => a.kind.localeCompare(b.kind)
    || (a.variants[0].activity?.tier ?? 0) - (b.variants[0].activity?.tier ?? 0)
    || (a.variants[0].activity?.order ?? 0) - (b.variants[0].activity?.order ?? 0)
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function matchesActivity(family: ActivityFamily, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  const text = [family.name, ...family.variants.flatMap((entry) => [entry.name, entry.activity?.region ?? ""])].join(" ").toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
