import { createElement } from "react";
import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorLink, InspectorSection } from "../inspector/inspector-types.ts";
import type { MapPointImageSource } from "../map/map-point-icon.tsx";
import EnchantmentDetails from "./enchantment-details.ts";
import { groupEnchantmentEquipment } from "./enchantment-equipment-groups.ts";
import { knowledgeSubjectKey } from "./mechanics-types.ts";
import { localizedKnowledgeValue } from "./localized-knowledge-value.ts";
import type { KnowledgeMechanicRecord, KnowledgeSubjectRef, LocalizedKnowledgeCopy, LocalizedKnowledgeNote,
  ValidatedMechanicsCatalog } from "./mechanics-types.ts";

export type KnowledgeSubjectDisplay = (kind: InspectorSubject["kind"], id: string) => { name: string; image?: MapPointImageSource };
export type KnowledgeBiomeFamilyResolver = (id: string) => { key: string; label: string; order: number } | null;
export type KnowledgeSubjectDescriptionResolver = (kind: InspectorSubject["kind"], id: string) => string | undefined;

export const createMechanicsSubjectDisplay = (catalog: ValidatedMechanicsCatalog, fallback: KnowledgeSubjectDisplay, locale: string): KnowledgeSubjectDisplay => {
  const subjects = new Map(catalog.subjects.map(subject => [knowledgeSubjectKey(subject), subject]));
  const gameNamedKinds = new Set<InspectorSubject["kind"]>(["item", "block", "entity", "biome", "enchantment"]);
  return (kind, id) => {
    const fallbackValue = fallback(kind, id);
    if (kind === "mechanic") {
      const mechanic = catalog.mechanics.find(entry => entry.id === id);
      if (mechanic) return { ...fallbackValue, name: localizedKnowledgeValue(mechanic.text, locale).name };
    }
    const subject = subjects.get(`${kind}:${id}`);
    const image = subject?.artwork ?? (subject?.image ? fallback(subject.image.kind, subject.image.id).image : undefined);
    const catalogName = subject?.text[locale]?.name ?? subject?.text[locale.split("-")[0]]?.name;
    const name = catalogName ?? (locale !== "en" && gameNamedKinds.has(kind)
      ? fallbackValue.name : subject ? localizedKnowledgeValue(subject.text, locale).name : fallbackValue.name);
    return subject ? { ...fallbackValue, name, ...(image ? { image } : {}) } : fallbackValue;
  };
};

const noteText = (note: LocalizedKnowledgeNote | undefined, locale: string) => note ? localizedKnowledgeValue(note, locale) : undefined;
const INLINE_MECHANIC_KINDS = new Set<KnowledgeMechanicRecord["kind"]>(["barter", "interaction", "equipment", "taming", "breeding",
  "harvesting", "use", "enchanting", "generation", "progression"]);
const ACTION_INPUT_KINDS = new Set<KnowledgeMechanicRecord["kind"]>(["equipment", "taming", "breeding"]);
const DIRECT_OUTPUT_KINDS = new Set<KnowledgeMechanicRecord["kind"]>(["drop", "loot", "breaking"]);
const RELATIONSHIP_TITLE_KEYS = {
  "obtainedFrom:drop": "inspector.relationshipTitles.droppedBy",
  "obtainedFrom:trade": "inspector.relationshipTitles.availableFromTrades",
  "obtainedFrom:breaking": "inspector.relationshipTitles.obtainedByBreaking",
  "obtainedFrom:harvesting": "inspector.relationshipTitles.obtainedByHarvesting",
  "usedFor:trade": "inspector.relationshipTitles.usedInTrades",
} as const;
const isSameItemOrBlock = (left: KnowledgeSubjectRef, right: KnowledgeSubjectRef) => left.id === right.id
  && (left.kind === right.kind || left.kind === "item" && right.kind === "block" || left.kind === "block" && right.kind === "item");

export const createMechanicsInspectorResolver = (catalog: ValidatedMechanicsCatalog, fallback: KnowledgeSubjectDisplay,
  t: TFunction, locale: string, biomeFamily?: KnowledgeBiomeFamilyResolver,
  craftedItemIds: ReadonlySet<string> = new Set(), describeSubject?: KnowledgeSubjectDescriptionResolver) => {
  const subjects = new Map(catalog.subjects.map(subject => [knowledgeSubjectKey(subject), subject]));
  const mechanics = new Map(catalog.mechanics.map(mechanic => [mechanic.id, mechanic]));
  const display = createMechanicsSubjectDisplay(catalog, fallback, locale);
  const referenceLink = (entry: KnowledgeSubjectRef, key: string): InspectorLink => {
    const details: string[] = [];
    if (entry.count && entry.count.min !== entry.count.max) details.push(t("inspector.quantityRange", entry.count));
    const percent = (value: number) => new Intl.NumberFormat(locale, {
      style: "percent", maximumFractionDigits: 2 }).format(value);
    if (entry.chance !== undefined) details.push(t("inspector.chance", { value: percent(entry.chance) }));
    if (entry.drop?.requiresPlayerKill) details.push(t("inspector.mobDetails.dropPlayerKill"));
    if (entry.drop?.baseChance !== undefined)
      details.push(t("inspector.mobDetails.dropBaseChance", { value: percent(entry.drop.baseChance) }));
    if (entry.drop?.lootingFirstChance !== undefined)
      details.push(t("inspector.mobDetails.dropLootingChance", { value: percent(entry.drop.lootingFirstChance),
        step: percent(entry.drop.lootingChanceStep ?? 0) }));
    if (entry.drop?.lootingAffectsCount) details.push(t("inspector.mobDetails.dropLootingCount"));
    if (entry.drop?.smeltsWhenBurning) details.push(t("inspector.mobDetails.dropSmelt"));
    if (entry.drop?.otherConditions) details.push(t("inspector.mobDetails.dropOtherConditions"));
    const note = noteText(entry.note, locale); if (note) details.push(note);
    return { key, subject: { kind: entry.kind, id: entry.id }, ...display(entry.kind, entry.id),
      ...(entry.count?.min === entry.count?.max ? { quantity: entry.count?.min } : {}), ...(details.length ? { note: details.join(" · ") } : {}) };
  };
  const transactionItem = (entry: KnowledgeSubjectRef) => ({ ...display(entry.kind, entry.id),
    ...(entry.count ? { quantity: entry.count.min === entry.count.max ? entry.count.min : t("inspector.quantityRange", entry.count) } : {}) });
  const transactionSideName = (values: ReturnType<typeof transactionItem>[]) => values
    .map(value => `${value.quantity ? `${value.quantity}× ` : ""}${value.name}`).join(" + ");
  const tradeLink = (entry: KnowledgeMechanicRecord, key: string): InspectorLink => {
    const inputs = entry.inputs.map(transactionItem), outputs = entry.outputs.map(transactionItem);
    return { key, subject: { kind: "mechanic", id: entry.id }, name: `${transactionSideName(inputs)} → ${transactionSideName(outputs)}`,
      transaction: { inputs, outputs } };
  };
  const tradeSections = (key: string, values: readonly KnowledgeMechanicRecord[]): InspectorSection[] => {
    const byLevel = new Map<number | null, KnowledgeMechanicRecord[]>();
    for (const value of values) {
      const level = value.trade?.level ?? null;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level)!.push(value);
    }
    const sorted = [...byLevel].sort(([left], [right]) => (left ?? 0) - (right ?? 0));
    return sorted.map(([level, entries], index) => ({ key: `${key}:${level ?? "offers"}`,
      title: level && level <= 5 ? t(`inspector.tradeLevels.${level}`) : t("inspector.tradeOffers"),
      collapsed: index > 0, links: entries.map(value => tradeLink(value, `${key}:${value.id}`)) }));
  };
  const uniqueLinks = (links: readonly InspectorLink[]) => [...new Map(links.map(link => [`${link.subject.kind}:${link.subject.id}`, link])).values()];
  const referenceSection = (key: string, title: string, values: readonly KnowledgeSubjectRef[]): InspectorSection | null =>
    values.length ? { key, title, links: values.map((entry, index) => referenceLink(entry, `${key}:${index}`)) } : null;
  return (subject: InspectorSubject): InspectorContent | null => {
    if (subject.kind === "mechanic") {
      const entry = mechanics.get(subject.id); if (!entry) return null;
      if (entry.kind === "progression") return null;
      const copy = localizedKnowledgeValue(entry.text, locale), subjectLink = referenceLink(entry.subject, "subject:0");
      const inputs = entry.inputs.map(transactionItem), outputs = entry.outputs.map(transactionItem);
      if (entry.kind === "trade" && entry.subject.kind === "trade") subjectLink.name = subjectLink.name.replace(/\s+trades$/i, "");
      const sections = [
        { key: "subject", title: t(entry.kind === "trade" ? "inspector.tradeProfession" : "inspector.mechanicSubject"), links: [subjectLink] },
        referenceSection("requirements", t("inspector.requirements"), entry.requirements),
        referenceSection("inputs", t("inspector.inputs"), entry.inputs),
        referenceSection("outputs", t("inspector.outcomes"), entry.outputs),
        referenceSection("related", t("inspector.related"), entry.related),
      ].filter((value): value is InspectorSection => value !== null);
      const tradeDetails = entry.kind === "trade" ? [
        ...(entry.trade?.level && entry.trade.level <= 5 ? [t(`inspector.tradeLevels.${entry.trade.level}`)] : []),
      ] : [];
      const iconImages = entry.kind === "trade" ? [...entry.inputs, ...entry.outputs]
        .map(value => display(value.kind, value.id).image).filter((value): value is MapPointImageSource => Boolean(value))
        .filter((value, index, values) => values.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(value)) === index)
        .slice(0, 2) : [];
      const name = entry.kind === "trade" ? `${transactionSideName(inputs)} → ${transactionSideName(outputs)}` : copy.name;
      return { ...display("mechanic", entry.id), name, category: t(`inspector.mechanicKinds.${entry.kind}`),
        contextLabel: `${catalog.source.edition} · ${catalog.source.version} · ${catalog.source.title}`,
        ...(entry.kind !== "trade" && copy.description ? { description: copy.description } : {}),
        ...(iconImages.length ? { iconImages } : {}),
        ...(tradeDetails.length ? { pillSections: [{ key: "trade-details", title: t("inspector.tradeLevel"), values: tradeDetails }] } : {}),
        sections };
    }
    if (!(["item", "entity", "block", "loot", "trade", "enchantment", "advancement", "biome", "poi"] as const).includes(subject.kind as never)) return null;
    if (subject.kind === "advancement") return null;
    const entry = subjects.get(`${subject.kind}:${subject.id}`); if (!entry) return null;
    const copy: LocalizedKnowledgeCopy = localizedKnowledgeValue(entry.text, locale), ids = catalog.index[knowledgeSubjectKey(entry)] ?? [];
    const visibleMechanics = ids.map(id => mechanics.get(id)!).filter(mechanic => mechanic.kind !== "progression");
    const owned = visibleMechanics.filter(mechanic => mechanic.subject.kind === entry.kind && mechanic.subject.id === entry.id);
    const involved = visibleMechanics.filter(mechanic => !owned.includes(mechanic));
    const groups = new Map<KnowledgeMechanicRecord["kind"], KnowledgeMechanicRecord[]>();
    for (const mechanic of owned) { if (!groups.has(mechanic.kind)) groups.set(mechanic.kind, []); groups.get(mechanic.kind)!.push(mechanic); }
    const ownedRefs = (values: readonly KnowledgeMechanicRecord[], key: "requirements" | "inputs" | "outputs" | "related") =>
      values.flatMap(value => value[key]).filter(value => value.kind !== entry.kind || value.id !== entry.id);
    const sections: InspectorSection[] = [...groups].flatMap(([kind, values]) => {
      if (kind === "trade") return tradeSections("mechanics:trade", values);
      if (entry.kind === "entity" && (kind === "harvesting" || kind === "interaction" || kind === "barter")
        && values.some(value => value.outputs.length)) {
        const sourced = values.filter(value => value.outputs.length);
        if (sourced.length > 4) return [{ key: `mechanics:${kind}:actions`, title: t(`inspector.mechanicKinds.${kind}`),
          links: sourced.flatMap(value => value.outputs.map((output, index) => ({
            ...referenceLink(output, `owned:${value.id}:output:${index}`),
            note: localizedKnowledgeValue(value.text, locale).name,
          }))) }];
        return sourced.map(value => ({
          key: `mechanics:${value.id}`, title: localizedKnowledgeValue(value.text, locale).name,
          links: value.outputs.map((output, index) => referenceLink(output, `owned:${value.id}:output:${index}`)),
        }));
      }
      const outputs = DIRECT_OUTPUT_KINDS.has(kind) ? values.flatMap(mechanic => mechanic.outputs.map((output, index) =>
        ({ output, link: referenceLink(output, `owned:${mechanic.id}:output:${index}`) })))
        .filter(({ output }) => !isSameItemOrBlock(entry, output)).map(({ link }) => link) : [];
      if (outputs.length) return [{ key: `mechanics:${kind}`, title: t(`inspector.mechanicKinds.${kind}`), links: outputs,
        ...(kind === "drop" && entry.kind === "entity"
          ? { previewSize: 4, description: t("inspector.mobDetails.dropCaveat") } : {}) }];
      if (DIRECT_OUTPUT_KINDS.has(kind)) return [];
      return [
        referenceSection(`mechanics:${kind}:requirements`, t(kind === "feeding" ? "inspector.mechanicKinds.feeding"
          : kind === "progression" ? "inspector.previousAdvancement" : "inspector.requirements"),
          kind === "enchanting" && entry.kind === "enchantment" ? [] : ownedRefs(values, "requirements")),
        referenceSection(`mechanics:${kind}:inputs`, t(kind === "progression" ? "inspector.requiredAdvancementItems"
          : ACTION_INPUT_KINDS.has(kind) ? `inspector.mechanicKinds.${kind}` : "inspector.inputs"),
          ownedRefs(values, "inputs")),
        referenceSection(`mechanics:${kind}:outputs`, t("inspector.outcomes"), ownedRefs(values, "outputs")),
        referenceSection(`mechanics:${kind}:related`, t(kind === "progression" ? "inspector.requiredAdvancementEntities" : "inspector.related"),
          kind === "enchanting" && entry.kind === "enchantment" ? [] : ownedRefs(values, "related")),
      ].filter((value): value is InspectorSection => value !== null);
    });
    const groupedBiomeMechanics = new Set<string>(), biomeGroups = new Map<string, { label: string; order: number }>();
    const spawnLinks: InspectorLink[] = [], spawnCategories = new Set<string>();
    if (subject.kind === "entity" && biomeFamily) for (const mechanic of involved) {
      if (mechanic.kind !== "generation" || mechanic.subject.kind !== "biome") continue;
      const family = biomeFamily(mechanic.subject.id);
      groupedBiomeMechanics.add(mechanic.id);
      if (family && !biomeGroups.has(family.key)) biomeGroups.set(family.key, { label: family.label, order: family.order });
      const spawn = mechanic.related.find(ref => ref.kind === "entity" && ref.id === entry.id)?.spawn;
      if (spawn) {
        spawnCategories.add(spawn.category);
        const group = spawn.group.min === spawn.group.max ? `${spawn.group.min}`
          : t("inspector.quantityRange", spawn.group);
        spawnLinks.push({ ...referenceLink(mechanic.subject, `spawn:${mechanic.id}`),
          note: t("inspector.mobDetails.spawnEntry", { category: t(`inspector.mobDetails.spawnCategories.${spawn.category}`),
            group, weight: spawn.weight }) });
      } else spawnLinks.push(referenceLink(mechanic.subject, `spawn:${mechanic.id}`));
    }
    const biomeFamilies = [...biomeGroups.values()].sort((left, right) => left.order - right.order)
      .map(group => group.label);
    if (spawnLinks.length) sections.unshift({ key: "entity:spawn-data", title: t("inspector.mobDetails.spawnData"),
      description: t(spawnCategories.size ? "inspector.mobDetails.spawnCaveat" : "inspector.mobDetails.biomeEntryCaveat"), links: spawnLinks,
      collapsed: spawnLinks.length > 8 });
    const involvedGroups = new Map<string, { role: "obtainedFrom" | "usedFor" | "requiredFor" | "relatedTo";
      kind: KnowledgeMechanicRecord["kind"]; values: KnowledgeMechanicRecord[] }>();
    const includesEntry = (values: readonly KnowledgeSubjectRef[]) => values.some(value => value.kind === entry.kind && value.id === entry.id);
    for (const mechanic of involved) {
      if (groupedBiomeMechanics.has(mechanic.id)) continue;
      if (mechanic.kind === "loot" && includesEntry(mechanic.outputs)) continue;
      if (entry.kind === "enchantment" && mechanic.kind === "enchanting" && includesEntry(mechanic.related)) continue;
      const reclaimsCraftedBlock = mechanic.kind === "breaking" && craftedItemIds.has(entry.id)
        && isSameItemOrBlock(entry, mechanic.subject) && includesEntry(mechanic.outputs);
      if (reclaimsCraftedBlock) continue;
      const role = includesEntry(mechanic.outputs) ? "obtainedFrom" : includesEntry(mechanic.inputs) ? "usedFor"
        : includesEntry(mechanic.requirements) ? "requiredFor" : "relatedTo";
      const key = `${role}:${mechanic.kind}`;
      if (!involvedGroups.has(key)) involvedGroups.set(key, { role, kind: mechanic.kind, values: [] });
      involvedGroups.get(key)!.values.push(mechanic);
    }
    const relationshipTitle = (role: "obtainedFrom" | "usedFor" | "requiredFor" | "relatedTo",
      kind: KnowledgeMechanicRecord["kind"]) => {
      if (role === "requiredFor" && kind === "enchanting" && (entry.kind === "item" || entry.kind === "block")) {
        return t("inspector.relationshipTitles.availableEnchantments");
      }
      const titleKey = RELATIONSHIP_TITLE_KEYS[`${role}:${kind}` as keyof typeof RELATIONSHIP_TITLE_KEYS];
      return titleKey ? t(titleKey) : t(`inspector.relationshipGroups.${role}`, { kind: t(`inspector.mechanicKinds.${kind}`) });
    };
    sections.push(...[...involvedGroups].flatMap(([key, group]) => group.kind === "progression"
      ? [{ key: `involved:${key}`, title: t(group.role === "requiredFor" ? "inspector.nextAdvancements" : "inspector.requiredForAdvancements"),
        links: group.values.map(value => referenceLink(value.subject, `involved:${value.id}`)) }]
      : group.kind === "trade" ? [{ key: `involved:${key}`, title: relationshipTitle(group.role, group.kind),
        links: group.values.map(value => tradeLink(value, `involved:${value.id}`)) }]
        : [{ key: `involved:${key}`, title: relationshipTitle(group.role, group.kind),
          links: (group.kind === "barter" || group.kind === "harvesting" || group.kind === "interaction"
            ? group.values.flatMap(value => {
              const targets = group.role === "usedFor" && value.outputs.length ? value.outputs : [value.subject];
              return targets.map((target, index) => ({ ...referenceLink(target, `involved:${value.id}:${index}`),
                note: localizedKnowledgeValue(value.text, locale).name }));
            }) : uniqueLinks(group.values.flatMap(value => {
            const targets = group.role === "usedFor" && value.outputs.length ? value.outputs : [value.subject];
            return targets.map((target, index) => referenceLink(target, `involved:${value.id}:${index}`));
          }))) }]));
    const friendlyDescription = describeSubject?.(entry.kind, entry.id);
    const inlineDescriptions = owned.filter(mechanic => !(entry.kind === "entity" && mechanic.kind === "drop" && !mechanic.outputs.length)
      && !(mechanic.subject.kind === "entity" && mechanic.kind !== "drop"
        && mechanic.provenance.path.includes("/loot_table/"))
      && (!friendlyDescription || mechanic.kind !== "generation")
      && (INLINE_MECHANIC_KINDS.has(mechanic.kind)
      || DIRECT_OUTPUT_KINDS.has(mechanic.kind) && !mechanic.outputs.length))
      .map(mechanic => localizedKnowledgeValue(mechanic.text, locale).description).filter((value): value is string => Boolean(value));
    const description = [...new Set([entry.kind === "entity" ? friendlyDescription
      : friendlyDescription ?? copy.description, ...inlineDescriptions]
      .filter((value): value is string => Boolean(value)))].join("\n\n");
    const enchanting = entry.kind === "enchantment" ? owned.find(mechanic => mechanic.kind === "enchanting") : undefined;
    const conflicts = enchanting?.related.filter(ref => ref.kind === "enchantment") ?? [];
    if (conflicts.length) sections.unshift({ key: "enchantment:conflicts",
      title: t("inspector.enchantmentConflicts"),
      links: conflicts.map((ref, index) => referenceLink(ref, `enchantment:conflict:${index}`)) });
    const equipment = enchanting ? groupEnchantmentEquipment(enchanting.requirements) : [];
    const equipmentLabels = equipment.map(group => group.type
      ? t(`inspector.enchantmentEquipmentTypes.${group.type}`)
      : display(group.item!.kind, group.item!.id).name);
    const body = enchanting?.enchantment ? createElement(EnchantmentDetails, {
      title: t("inspector.enchantmentDetails"), maximumLevelLabel: t("inspector.enchantmentMaximumLevel"),
      maximumLevel: enchanting.enchantment.maxLevel,
      selectionWeightLabel: t("inspector.enchantmentSelectionWeight"), selectionWeight: enchanting.enchantment.weight,
      anvilMultiplierLabel: t("inspector.enchantmentAnvilMultiplier"), anvilMultiplier: enchanting.enchantment.anvilCost,
      compatibleEquipmentLabel: t("inspector.enchantmentCompatibleEquipment"), equipment: equipmentLabels,
      activeSlotsLabel: t("inspector.enchantmentActiveSlots"), slots: enchanting.enchantment.slots,
      effectsLabel: t("inspector.enchantmentEffects"), effects: enchanting.enchantment.effects,
    }) : undefined;
    return { ...display(entry.kind, entry.id), name: copy.name, category: t(`inspector.subjectKinds.${entry.kind}`),
      contextLabel: `${catalog.source.edition} · ${catalog.source.version} · ${catalog.source.title}`,
      ...(description ? { description } : {}), ...(body ? { body } : {}),
      ...(entry.kind === "entity" && spawnLinks.length ? { facts: [
        { key: "biome-spawns", label: t("inspector.mobDetails.biomeSpawnLabel"),
          value: t("inspector.mobDetails.biomeSpawnCount", { count: spawnLinks.length }) },
        ...(spawnCategories.size === 1 ? [{ key: "spawn-category", label: t("inspector.mobDetails.spawnCategoryLabel"),
          value: t(`inspector.mobDetails.spawnCategories.${[...spawnCategories][0]}`) }] : []),
      ] } : {}),
      ...(biomeFamilies.length ? { pillSections: [{ key: "spawn-biomes", title: t("inspector.spawnsIn"), values: biomeFamilies }] } : {}),
      sections };
  };
};
