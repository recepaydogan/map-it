import { KNOWLEDGE_MECHANIC_KINDS, KNOWLEDGE_SUBJECT_KINDS, knowledgeSubjectKey } from "./mechanics-types.ts";
import type { KnowledgeMechanicRecord, KnowledgeSubjectKind, KnowledgeSubjectRecord, LocalizedKnowledgeNote,
  LocalizedKnowledgeText, MechanicsCatalogIdentity, ValidatedMechanicsCatalog } from "./mechanics-types.ts";

export const MECHANICS_CATALOG_FILE_LIMIT = 16 * 1024 * 1024;
const localePattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const idPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i;
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, limit = 1024) => {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Invalid ${label}.`);
  return value;
};
const id = (value: unknown, label: string) => {
  const result = text(value, label, 512);
  if (!idPattern.test(result)) throw new Error(`Invalid ${label}.`);
  return result;
};
const url = (value: unknown, label: string) => {
  const result = text(value, label, 4096);
  if (!/^https:\/\/[^\s]+$/i.test(result)) throw new Error(`Invalid ${label}.`);
  return result;
};
const artwork = (value: unknown) => {
  const result = text(value, "knowledge subject artwork", 1024);
  if (!/^\/(?:knowledge-data|guide-artwork)\/[A-Za-z0-9_./-]+\.(?:png|webp|svg)$/i.test(result)
    || result.includes("..")) throw new Error("Invalid knowledge subject artwork.");
  return result;
};
const localizedText = (value: unknown, label: string): LocalizedKnowledgeText => {
  const entries = Object.entries(record(value, label));
  if (!entries.length || entries.length > 32 || !entries.some(([locale]) => locale === "en")) throw new Error(`Invalid ${label}.`);
  return Object.freeze(Object.fromEntries(entries.map(([locale, raw]) => {
    if (!localePattern.test(locale)) throw new Error(`Invalid ${label} locale.`);
    const copy = record(raw, `${label} copy`);
    return [locale, Object.freeze({ name: text(copy.name, `${label} name`, 160),
      ...(copy.description === undefined ? {} : { description: text(copy.description, `${label} description`, 4096) }) })];
  })));
};
const localizedNote = (value: unknown, label: string): LocalizedKnowledgeNote => {
  const entries = Object.entries(record(value, label));
  if (!entries.length || entries.length > 32 || !entries.some(([locale]) => locale === "en")) throw new Error(`Invalid ${label}.`);
  return Object.freeze(Object.fromEntries(entries.map(([locale, raw]) => {
    if (!localePattern.test(locale)) throw new Error(`Invalid ${label} locale.`);
    return [locale, text(raw, `${label} text`, 512)];
  })));
};
const subjectKind = (value: unknown): KnowledgeSubjectKind => {
  if (!(KNOWLEDGE_SUBJECT_KINDS as readonly unknown[]).includes(value)) throw new Error("Invalid knowledge subject kind.");
  return value as KnowledgeSubjectKind;
};
const subject = (value: unknown): KnowledgeSubjectRecord => {
  const input = record(value, "knowledge subject");
  const image = input.image === undefined ? undefined : record(input.image, "knowledge subject image");
  return Object.freeze({ kind: subjectKind(input.kind), id: id(input.id, "knowledge subject identity"),
    text: localizedText(input.text, "knowledge subject text"),
    ...(input.artwork === undefined ? {} : { artwork: artwork(input.artwork) }), ...(image ? { image: Object.freeze({
      kind: subjectKind(image.kind), id: id(image.id, "knowledge subject image identity"),
    }) } : {}) });
};
const reference = (value: unknown, label: string) => {
  const input = record(value, label), kind = subjectKind(input.kind), identity = id(input.id, `${label} identity`);
  let count: { min: number; max: number } | undefined;
  if (input.count !== undefined) {
    const raw = record(input.count, `${label} count`), min = raw.min, max = raw.max;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || (min as number) < 0 || (max as number) < (min as number)
      || (max as number) > 65536) throw new Error(`Invalid ${label} count.`);
    count = { min: min as number, max: max as number };
  }
  if (input.chance !== undefined && (typeof input.chance !== "number" || !Number.isFinite(input.chance)
    || input.chance < 0 || input.chance > 1)) throw new Error(`Invalid ${label} chance.`);
  const rawSpawn = input.spawn === undefined ? undefined : record(input.spawn, `${label} spawn`);
  if (rawSpawn && kind !== "entity") throw new Error("Spawn data must reference an entity.");
  const spawnCategory = rawSpawn ? text(rawSpawn.category, `${label} spawn category`, 64) : undefined;
  if (spawnCategory && !/^[a-z_]+$/.test(spawnCategory)) throw new Error(`Invalid ${label} spawn category.`);
  const spawnWeight = optionalInteger(rawSpawn?.weight, `${label} spawn weight`, 1, 100000);
  const rawGroup = rawSpawn ? record(rawSpawn.group, `${label} spawn group`) : undefined;
  const spawnMin = optionalInteger(rawGroup?.min, `${label} spawn group minimum`, 1, 256);
  const spawnMax = optionalInteger(rawGroup?.max, `${label} spawn group maximum`, 1, 256);
  if (rawSpawn && (spawnWeight === undefined || spawnMin === undefined || spawnMax === undefined || spawnMax < spawnMin))
    throw new Error(`Invalid ${label} spawn data.`);
  const rawDrop = input.drop === undefined ? undefined : record(input.drop, `${label} drop`);
  if (rawDrop && kind !== "item") throw new Error("Drop data must reference an item.");
  const dropChance = (key: string) => {
    const value = rawDrop?.[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
      throw new Error(`Invalid ${label} ${key}.`);
    return value;
  };
  const dropFlag = (key: string) => {
    const value = rawDrop?.[key];
    if (value !== undefined && typeof value !== "boolean") throw new Error(`Invalid ${label} ${key}.`);
    return value as boolean | undefined;
  };
  const drop = rawDrop ? Object.freeze({
    ...(dropChance("baseChance") === undefined ? {} : { baseChance: dropChance("baseChance") }),
    ...(dropChance("lootingFirstChance") === undefined ? {} : { lootingFirstChance: dropChance("lootingFirstChance") }),
    ...(dropChance("lootingChanceStep") === undefined ? {} : { lootingChanceStep: dropChance("lootingChanceStep") }),
    ...Object.fromEntries(["requiresPlayerKill", "lootingAffectsCount", "smeltsWhenBurning", "otherConditions"]
      .flatMap(key => dropFlag(key) === undefined ? [] : [[key, dropFlag(key)]])),
  }) : undefined;
  return Object.freeze({ kind, id: identity, ...(count ? { count: Object.freeze(count) } : {}),
    ...(input.chance === undefined ? {} : { chance: input.chance as number }),
    ...(input.note === undefined ? {} : { note: localizedNote(input.note, `${label} note`) }),
    ...(rawSpawn ? { spawn: Object.freeze({ category: spawnCategory!, weight: spawnWeight!,
      group: Object.freeze({ min: spawnMin!, max: spawnMax! }) }) } : {}), ...(drop ? { drop } : {}) });
};
const references = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.length > 256) throw new Error(`Invalid ${label}.`);
  return Object.freeze(value.map(entry => reference(entry, label)));
};
const optionalInteger = (value: unknown, label: string, minimum: number, maximum: number) => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`Invalid ${label}.`);
  return value as number;
};
const mechanic = (value: unknown, expected: MechanicsCatalogIdentity): KnowledgeMechanicRecord => {
  const input = record(value, "knowledge mechanic");
  if (!(KNOWLEDGE_MECHANIC_KINDS as readonly unknown[]).includes(input.kind)) throw new Error("Invalid knowledge mechanic kind.");
  const owner = reference(input.subject, "mechanic subject"), provenance = record(input.provenance, "mechanic provenance");
  if (owner.count || owner.chance !== undefined || owner.note || owner.spawn || owner.drop) throw new Error("Invalid mechanic subject modifiers.");
  const sourceUrl = url(provenance.url, "mechanic source URL");
  const revision = provenance.revision === undefined ? expected.revision : text(provenance.revision, "mechanic source revision", 128);
  if (!sourceUrl.includes(revision)) throw new Error("Mechanic source URL does not identify its provenance revision.");
  const sha256 = text(provenance.sha256, "mechanic source hash", 64);
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("Invalid mechanic source hash.");
  const rawTrade = input.trade === undefined ? undefined : record(input.trade, "mechanic trade data");
  if (rawTrade && input.kind !== "trade") throw new Error("Trade data belongs to a trade mechanic.");
  const level = optionalInteger(rawTrade?.level, "trade level", 1, 64);
  const maxUses = optionalInteger(rawTrade?.maxUses, "trade maximum uses", 0, 65536);
  const experience = optionalInteger(rawTrade?.experience, "trade experience", 0, 65536);
  const trade = rawTrade ? Object.freeze({ ...(level === undefined ? {} : { level }), ...(maxUses === undefined ? {} : { maxUses }),
    ...(experience === undefined ? {} : { experience }) }) : undefined;
  const rawEnchantment = input.enchantment === undefined ? undefined : record(input.enchantment, "mechanic enchantment data");
  if (rawEnchantment && input.kind !== "enchanting") throw new Error("Enchantment data belongs to an enchanting mechanic.");
  const stringList = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.length > 64) throw new Error(`Invalid ${label}.`);
    return Object.freeze(value.map(entry => text(entry, label, 160)));
  };
  let enchantment: KnowledgeMechanicRecord["enchantment"];
  if (rawEnchantment) {
    const maxLevel = optionalInteger(rawEnchantment.maxLevel, "enchantment maximum level", 1, 255);
    const weight = optionalInteger(rawEnchantment.weight, "enchantment weight", 1, 255);
    const anvilCost = optionalInteger(rawEnchantment.anvilCost, "enchantment anvil cost", 0, 255);
    if (maxLevel === undefined || weight === undefined || anvilCost === undefined) throw new Error("Incomplete enchantment data.");
    enchantment = Object.freeze({ maxLevel, weight, anvilCost,
      slots: stringList(rawEnchantment.slots ?? [], "enchantment slot"),
      effects: stringList(rawEnchantment.effects ?? [], "enchantment effect") });
  }
  const result = { id: id(input.id, "mechanic identity"), kind: input.kind as KnowledgeMechanicRecord["kind"],
    subject: Object.freeze({ kind: owner.kind, id: owner.id }), text: localizedText(input.text, "mechanic text"),
    requirements: references(input.requirements ?? [], "mechanic requirement"), inputs: references(input.inputs ?? [], "mechanic input"),
    outputs: references(input.outputs ?? [], "mechanic output"), related: references(input.related ?? [], "mechanic relation"),
    ...(trade ? { trade } : {}), ...(enchantment ? { enchantment } : {}),
    provenance: Object.freeze({ path: text(provenance.path, "mechanic source path", 1024), revision, sha256, url: sourceUrl }) };
  if (!["generation", "progression", "drop", "loot", "breaking"].includes(result.kind)
    && ![result.requirements, result.inputs, result.outputs, result.related].some(group => group.length))
    throw new Error("Mechanic has no structured relationships.");
  return Object.freeze(result);
};

export const parseMechanicsCatalogArtifact = (value: unknown, expected: Pick<MechanicsCatalogIdentity, "edition" | "version">): ValidatedMechanicsCatalog => {
  const root = record(value, "mechanics catalog");
  if (root.schemaVersion !== 1 || root.kind !== "mechanics-catalog") throw new Error("Unsupported mechanics catalog schema.");
  const rawSource = record(root.source, "mechanics catalog source");
  const source = Object.freeze({ edition: text(rawSource.edition, "catalog edition", 64), version: text(rawSource.version, "catalog version", 64),
    revision: text(rawSource.revision, "catalog revision", 128), title: text(rawSource.title, "catalog title", 160),
    url: url(rawSource.url, "catalog source URL") });
  if (source.edition !== expected.edition || source.version !== expected.version)
    throw new Error("Mechanics catalog does not match the selected world's exact edition and version.");
  if (!source.url.includes(source.revision)) throw new Error("Catalog source URL does not identify its revision.");
  if (!Array.isArray(root.subjects) || !root.subjects.length || root.subjects.length > 10000
    || !Array.isArray(root.mechanics) || !root.mechanics.length || root.mechanics.length > 20000)
    throw new Error("Invalid mechanics catalog records.");
  const subjects = Object.freeze(root.subjects.map(subject)), subjectKeys = new Set<string>();
  for (const entry of subjects) {
    const key = knowledgeSubjectKey(entry); if (subjectKeys.has(key)) throw new Error("Duplicate knowledge subject identity."); subjectKeys.add(key);
  }
  const mechanics = Object.freeze(root.mechanics.map(entry => mechanic(entry, source))), mechanicIds = new Set<string>();
  const index = new Map<string, Set<string>>();
  for (const entry of mechanics) {
    if (mechanicIds.has(entry.id)) throw new Error("Duplicate mechanic identity."); mechanicIds.add(entry.id);
    const participants = [entry.subject, ...entry.requirements, ...entry.inputs, ...entry.outputs, ...entry.related];
    for (const participant of participants) {
      const key = knowledgeSubjectKey(participant);
      if (!subjectKeys.has(key)) throw new Error("Mechanic references an unknown knowledge subject.");
      if (!index.has(key)) index.set(key, new Set()); index.get(key)!.add(entry.id);
    }
  }
  for (const entry of subjects) if (entry.image && !subjectKeys.has(knowledgeSubjectKey(entry.image)))
    throw new Error("Knowledge subject image references an unknown subject.");
  for (const ids of index.values()) if (ids.size > 1024) throw new Error("Knowledge subject exceeds the mechanic relationship limit.");
  return Object.freeze({ source, subjects, mechanics,
    index: Object.freeze(Object.fromEntries([...index].map(([key, ids]) => [key, Object.freeze([...ids].sort())]))) });
};

export const loadMechanicsCatalogFile = async (file: File, expected: Pick<MechanicsCatalogIdentity, "edition" | "version">) => {
  if (!(file instanceof File) || !file.name.toLocaleLowerCase("en-US").endsWith(".json") || file.size < 2 || file.size > MECHANICS_CATALOG_FILE_LIMIT)
    throw new Error("Invalid mechanics catalog file.");
  return parseMechanicsCatalogArtifact(JSON.parse(await file.text()), expected);
};
