import type { KnowledgeMechanicKind, ValidatedMechanicsCatalog } from "./mechanics-types.ts";

export interface EntityLootAction {
  readonly path: string;
  readonly entity: string;
  readonly kind: Extract<KnowledgeMechanicKind, "barter" | "harvesting" | "interaction">;
  readonly input?: string;
  readonly labelKey?: string;
}

/** Connect separately declared entity actions to their subjects and reverse item links. */
export const connectEntityLootActions = (catalog: ValidatedMechanicsCatalog | null,
  actions: readonly EntityLootAction[], labels?: Readonly<{ locale: string; translate: (key: string, locale: string) => string }>)
  : ValidatedMechanicsCatalog | null => {
  if (!catalog) return null;
  const entityKeys = new Set(catalog.subjects.filter(subject => subject.kind === "entity").map(subject => subject.id));
  const itemKeys = new Set(catalog.subjects.filter(subject => subject.kind === "item").map(subject => subject.id));
  let changed = false;
  const mechanics = catalog.mechanics.map(mechanic => {
    if (mechanic.kind !== "loot" || !mechanic.outputs.length) return mechanic;
    const marker = mechanic.subject.id.indexOf(":loot/");
    const relative = marker < 0 ? "" : mechanic.subject.id.slice(marker + ":loot/".length);
    const action = actions.find(candidate => candidate.path.endsWith("/")
      ? relative.startsWith(candidate.path) : relative === candidate.path || relative.startsWith(`${candidate.path}/`));
    if (!action || !entityKeys.has(action.entity)) return mechanic;
    changed = true;
    const nameKey = action.labelKey ? `inspector.entityAcquisition.actions.${action.labelKey}` : null;
    const text = nameKey && labels ? Object.freeze({ ...mechanic.text,
      en: Object.freeze({ name: labels.translate(nameKey, "en") }),
      [labels.locale]: Object.freeze({ name: labels.translate(nameKey, labels.locale) }),
    }) : mechanic.text;
    return Object.freeze({ ...mechanic, kind: action.kind, subject: Object.freeze({ kind: "entity" as const, id: action.entity }),
      text, inputs: action.input && itemKeys.has(action.input)
        ? Object.freeze([{ kind: "item" as const, id: action.input }]) : mechanic.inputs });
  });
  if (!changed) return catalog;
  const index = new Map<string, Set<string>>();
  for (const mechanic of mechanics) for (const subject of [mechanic.subject, ...mechanic.requirements,
    ...mechanic.inputs, ...mechanic.outputs, ...mechanic.related]) {
    const key = `${subject.kind}:${subject.id}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)!.add(mechanic.id);
  }
  return Object.freeze({ ...catalog, mechanics: Object.freeze(mechanics),
    index: Object.freeze(Object.fromEntries([...index].map(([key, ids]) => [key, Object.freeze([...ids].sort())]))) });
};
