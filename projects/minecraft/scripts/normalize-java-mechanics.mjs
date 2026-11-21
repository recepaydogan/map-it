const idPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i;
const title = value => value.split(/[\/_-]+/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const english = (name, description) => ({ en: { name, ...(description ? { description } : {}) } });
const resourceId = value => {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  const id = normalized.includes(":") ? normalized : `minecraft:${normalized}`;
  return idPattern.test(id) ? id : null;
};
const countFrom = value => {
  if (Number.isSafeInteger(value) && value >= 0) return { min: value, max: value };
  if (!value || typeof value !== "object") return null;
  if (value.type === "minecraft:uniform" || value.type === "uniform") {
    const min = value.min_inclusive ?? value.min, max = value.max_inclusive ?? value.max;
    return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min >= 0 && max >= min ? { min, max } : null;
  }
  const min = value.min, max = value.max;
  return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min >= 0 && max >= min ? { min, max } : null;
};
const provenance = (file, source) => ({ path: file.path, revision: source.revision, sha256: file.sha256,
  url: `https://github.com/${source.repository}/blob/${source.revision}/${file.path}` });

const lootOutputs = data => {
  const found = new Map();
  const list = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const conditionsOf = value => list(value).flatMap(condition =>
    condition?.type === "minecraft:all_of" || condition?.condition === "minecraft:all_of"
      ? conditionsOf(condition.terms) : [condition]);
  const visit = (entry, inheritedConditions, singleEntry) => {
    if (!entry || typeof entry !== "object") return;
    const conditions = [...inheritedConditions, ...conditionsOf(entry.condition ?? entry.conditions)];
    if (entry.type === "minecraft:item" || entry.type === "item") {
      const id = resourceId(entry.name); if (!id) return;
      const modifiers = list(entry.modifier ?? entry.functions);
      let count = { min: 1, max: 1 }, unknownCount = false;
      for (const fn of modifiers) {
        if (fn?.type !== "minecraft:set_count" && fn?.function !== "minecraft:set_count"
          && fn?.function !== "set_count") continue;
        const parsed = countFrom(fn.count);
        if (parsed) count = parsed;
        else {
          const min = fn.count?.min ?? fn.count?.min_inclusive, max = fn.count?.max ?? fn.count?.max_inclusive;
          if (Number.isSafeInteger(min) && Number.isSafeInteger(max) && max >= min)
            count = { min: Math.max(0, min), max: Math.max(0, max) };
          else unknownCount = true;
        }
      }
      const chanceConditions = conditions.filter(condition => ["minecraft:random_chance", "minecraft:random_chance_with_enchanted_bonus"]
        .includes(condition?.type ?? condition?.condition));
      const chance = chanceConditions[0];
      const chanceType = chance?.type ?? chance?.condition;
      const otherConditions = conditions.some(condition => !["minecraft:killed_by_player", "minecraft:random_chance",
        "minecraft:random_chance_with_enchanted_bonus"].includes(condition?.type ?? condition?.condition));
      const simpleChance = singleEntry && !otherConditions && !unknownCount && count.min > 0 && chanceConditions.length === 1;
      const fixedChance = simpleChance && typeof chance?.chance === "number" ? chance.chance : undefined;
      const bonus = simpleChance && chanceType === "minecraft:random_chance_with_enchanted_bonus"
        && typeof chance.unenchanted_chance === "number" ? chance : undefined;
      const linear = bonus?.enchanted_chance;
      const drop = {
        ...(fixedChance !== undefined ? { baseChance: fixedChance } : {}),
        ...(bonus ? { baseChance: bonus.unenchanted_chance } : {}),
        ...(linear?.type === "minecraft:linear" && typeof linear.base === "number"
          && typeof linear.per_level_above_first === "number"
          ? { lootingFirstChance: linear.base, lootingChanceStep: linear.per_level_above_first } : {}),
        ...(conditions.some(condition => (condition?.type ?? condition?.condition) === "minecraft:killed_by_player")
          ? { requiresPlayerKill: true } : {}),
        ...(modifiers.some(fn => (fn?.type ?? fn?.function) === "minecraft:enchanted_count_increase")
          ? { lootingAffectsCount: true } : {}),
        ...(modifiers.some(fn => (fn?.type ?? fn?.function) === "minecraft:furnace_smelt")
          ? { smeltsWhenBurning: true } : {}),
        ...(otherConditions || chance && !simpleChance ? { otherConditions: true } : {}),
      };
      const current = found.get(id);
      found.set(id, { kind: "item", id,
        ...(!unknownCount && !current?.unknownCount ? { count: current?.count ? {
          min: Math.min(current.count.min, count.min), max: Math.max(current.count.max, count.max) } : count } : {}),
        ...(Object.keys(drop).length && !current ? { drop } : {}),
        ...(unknownCount ? { unknownCount: true } : {}) });
      return;
    }
    for (const child of list(entry.children ?? entry.entries)) visit(child, conditions, false);
  };
  for (const pool of list(data?.pools)) {
    const entries = list(pool?.entries), conditions = conditionsOf(pool?.condition ?? pool?.conditions);
    for (const entry of entries) visit(entry, conditions, entries.length === 1 && pool.rolls === 1);
  }
  return [...found.values()].map(({ unknownCount, ...output }) => output);
};

const tagResolver = (files, prefix, namespace = "minecraft") => {
  const tags = new Map();
  for (const file of files.filter(entry => entry.path.startsWith(prefix))) {
    try {
      const data = JSON.parse(file.text), id = `${namespace}:${file.path.slice(prefix.length, -5)}`;
      tags.set(id, Array.isArray(data.values) ? data.values.map(value => typeof value === "string" ? value : value?.id).filter(Boolean) : []);
    } catch { /* Invalid source JSON is reported by the main pass. */ }
  }
  const resolve = (value, seen = new Set()) => {
    if (typeof value !== "string") return [];
    if (!value.startsWith("#")) return resourceId(value) ? [resourceId(value)] : [];
    const id = resourceId(value); if (!id || seen.has(id)) return [];
    const nextSeen = new Set(seen).add(id);
    return [...new Set((tags.get(id) ?? []).flatMap(entry => resolve(entry, nextSeen)))];
  };
  return resolve;
};

const structureFamily = id => {
  const path = id.split(":")[1];
  if (path.startsWith("village_")) return "minecraft:village";
  if (path.startsWith("mineshaft")) return "minecraft:mineshaft";
  if (path.startsWith("ocean_ruin_")) return "minecraft:ocean_ruin";
  if (path.startsWith("shipwreck")) return "minecraft:shipwreck";
  if (path.startsWith("ruined_portal")) return "minecraft:ruined_portal";
  return id;
};

const advancementTargets = (data, resolveItemTag, resolveEntityTag) => {
  const items = new Set(), entities = new Set();
  const addValues = (value, target, resolve) => {
    for (const entry of Array.isArray(value) ? value : [value]) for (const id of resolve(entry)) if (id) target.add(id);
  };
  const visit = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "items") addValues(child, items, entry => typeof entry === "string"
        ? entry.startsWith("#") ? resolveItemTag(entry) : [resourceId(entry)] : []);
      else if (key === "minecraft:entity_type" || key === "entity_type")
        addValues(child, entities, entry => typeof entry === "string" && entry.startsWith("#") ? resolveEntityTag(entry) : [resourceId(entry)]);
      visit(child);
    }
  };
  visit(data.criteria);
  return { items: [...items].filter(Boolean), entities: [...entities].filter(Boolean) };
};

/** Builds the explorable Java guide graph from the exact pinned data snapshot. */
export const buildJavaMechanicsArtifact = (files, source) => {
  const subjects = new Map(), mechanics = [], issues = [];
  const addSubject = (kind, id, description, name = title(id.split(":")[1]), image) => {
    const key = `${kind}:${id}`;
    if (!subjects.has(key)) subjects.set(key, { kind, id, text: english(name, description), ...(image ? { image } : {}) });
  };
  const parsed = [];
  for (const file of files) {
    try { parsed.push({ file, data: JSON.parse(file.text) }); }
    catch (error) { issues.push({ path: file.path, code: "invalid-json", message: error.message }); }
  }

  for (const { file, data } of parsed.filter(entry => entry.file.path.startsWith(source.lootPrefix))) {
    const relative = file.path.slice(source.lootPrefix.length, -5), [group, ...rest] = relative.split("/");
    const outputs = lootOutputs(data);
    let subject;
    if (group === "entities") subject = { kind: "entity", id: `minecraft:${rest.length > 1 ? rest[0] : rest.at(-1)}` };
    else if (group === "blocks") subject = { kind: "block", id: `minecraft:${rest.at(-1)}` };
    else subject = { kind: "loot", id: `minecraft:loot/${relative}` };
    const lootName = group === "chests" ? `${title(rest.join("/"))} chest` : title(relative);
    const emptyDescription = subject.kind === "loot" ? "This loot table declares no direct item contents."
      : subject.kind === "block" ? "This block has no direct item drops in the selected version."
      : "This entity has no direct item drops in the selected version.";
    addSubject(subject.kind, subject.id, subject.kind === "entity" ? undefined
      : outputs.length ? subject.kind === "loot" ? "Possible contents are listed below."
        : "Break this block to obtain the possible drops listed below."
        : emptyDescription,
    subject.kind === "loot" ? lootName : title(subject.id.split(":")[1]));
    for (const output of outputs) addSubject("item", output.id);
    const kind = subject.kind === "entity" ? "drop" : subject.kind === "block" ? "breaking" : "loot";
    mechanics.push({ id: `minecraft:mechanic/loot/${relative}`, kind, subject,
      text: english(subject.kind === "loot" ? title(relative) : `${title(subject.id.split(":")[1])} drops`,
        outputs.length ? subject.kind === "loot" ? "Possible contents from this loot table." : "Possible drops from this game-data loot table."
          : emptyDescription),
      requirements: [], inputs: [], outputs, related: [], provenance: provenance(file, source) });
  }

  for (const { file, data } of parsed.filter(entry => entry.file.path.startsWith(source.tradePrefix))) {
    const relative = file.path.slice(source.tradePrefix.length, -5), parts = relative.split("/"), profession = parts[0];
    const ownerId = `minecraft:trade/${profession}`;
    const toRef = value => {
      const id = resourceId(value?.id); if (!id) return null;
      return { kind: "item", id, count: countFrom(value.count) ?? { min: 1, max: 1 } };
    };
    const inputs = [data.wants, ...(Array.isArray(data.additional_wants) ? data.additional_wants : data.additional_wants ? [data.additional_wants] : [])]
      .map(toRef).filter(Boolean), output = toRef(data.gives);
    if (!inputs.length || !output) continue;
    addSubject("trade", ownerId, profession === "wandering_trader" ? "Rotating wandering-trader offers."
      : `${title(profession)} villager offers grouped by profession level.`, title(profession));
    for (const ref of [...inputs, output]) addSubject("item", ref.id);
    const level = parts.length > 2 ? Number(parts[1]) : null;
    mechanics.push({ id: `minecraft:mechanic/trade/${relative}`, kind: "trade", subject: { kind: "trade", id: ownerId },
      text: english(title(parts.at(-1)), `${title(profession)} offer${level ? ` at profession level ${level}` : ""}.`),
      requirements: [], inputs, outputs: [output], related: [],
      trade: { ...(level ? { level } : {}), ...(Number.isFinite(data.max_uses) ? { maxUses: data.max_uses } : {}),
        ...(Number.isFinite(data.xp) ? { experience: data.xp } : {}) },
      provenance: provenance(file, source) });
  }

  const resolveItemTag = tagResolver(files, source.itemTagPrefix);
  const resolveEntityTag = tagResolver(files, source.entityTagPrefix);
  const resolveEnchantmentTag = tagResolver(files, source.enchantmentTagPrefix);
  for (const { file } of parsed.filter(entry => entry.file.path.startsWith(source.itemTagPrefix)
    && entry.file.path.endsWith("_food.json"))) {
    const name = file.path.slice(source.itemTagPrefix.length, -5);
    const entityId = `minecraft:${name.slice(0, -"_food".length)}`;
    if (!subjects.has(`entity:${entityId}`)) continue;
    const requirements = resolveItemTag(`#minecraft:${name}`).map(id => ({ kind: "item", id }));
    if (!requirements.length) continue;
    for (const ref of requirements) addSubject("item", ref.id);
    mechanics.push({ id: `minecraft:mechanic/food/${name}`, kind: "feeding",
      subject: { kind: "entity", id: entityId }, text: english(`${title(entityId.split(":")[1])} food`),
      requirements, inputs: [], outputs: [], related: [], provenance: provenance(file, source) });
  }
  const enchantments = parsed.filter(entry => entry.file.path.startsWith(source.enchantmentPrefix));
  for (const { file } of enchantments) addSubject("enchantment", `minecraft:${file.path.slice(source.enchantmentPrefix.length, -5)}`);
  for (const { file, data } of enchantments) {
    const id = `minecraft:${file.path.slice(source.enchantmentPrefix.length, -5)}`;
    const supported = resolveItemTag(data.supported_items).slice(0, 256).map(item => ({ kind: "item", id: item }));
    for (const ref of supported) addSubject("item", ref.id);
    const related = resolveEnchantmentTag(data.exclusive_set).filter(other => other !== id).slice(0, 256)
      .map(other => ({ kind: "enchantment", id: other }));
    const effects = Object.keys(data.effects ?? {}).map(value => title(value.split(":").at(-1)));
    const slots = Array.isArray(data.slots) ? data.slots.map(title) : [];
    mechanics.push({ id: `minecraft:mechanic/enchantment/${id.split(":")[1]}`, kind: "enchanting",
      subject: { kind: "enchantment", id }, text: english(title(id.split(":")[1])), requirements: supported, inputs: [], outputs: [], related,
      enchantment: { maxLevel: data.max_level ?? 1, weight: data.weight ?? 1, anvilCost: data.anvil_cost ?? 0, slots, effects },
      provenance: provenance(file, source) });
  }

  const translated = value => source.translations?.[value?.translate] ?? value?.text;
  const advancements = parsed.filter(entry => entry.file.path.startsWith(source.advancementPrefix) && entry.data.display);
  const advancementIds = new Set();
  for (const { file, data } of advancements) {
    const id = `minecraft:${file.path.slice(source.advancementPrefix.length, -5)}`, icon = resourceId(data.display.icon?.id);
    advancementIds.add(id);
    if (icon) addSubject("item", icon);
    addSubject("advancement", id, translated(data.display.description),
      translated(data.display.title) ?? title(id.split(":")[1]), icon ? { kind: "item", id: icon } : undefined);
  }
  for (const { file, data } of advancements) {
    const id = `minecraft:${file.path.slice(source.advancementPrefix.length, -5)}`, requirements = [];
    const parent = resourceId(data.parent);
    if (parent && advancementIds.has(parent)) requirements.push({ kind: "advancement", id: parent });
    const targets = advancementTargets(data, resolveItemTag, resolveEntityTag);
    const inputs = targets.items.slice(0, 256).map(item => ({ kind: "item", id: item }));
    const related = targets.entities.slice(0, 256).map(entity => ({ kind: "entity", id: entity }));
    for (const ref of inputs) addSubject("item", ref.id);
    for (const ref of related) addSubject("entity", ref.id);
    const details = [];
    if (Number.isFinite(data.rewards?.experience)) details.push(`Rewards ${data.rewards.experience} experience.`);
    mechanics.push({ id: `minecraft:mechanic/progression/${id.split(":")[1]}`, kind: "progression",
      subject: { kind: "advancement", id }, text: english(translated(data.display.title) ?? title(id.split(":")[1]), details.join(" ")),
      requirements, inputs, outputs: [], related, provenance: provenance(file, source) });
  }

  for (const { file, data } of parsed.filter(entry => entry.file.path.startsWith(source.biomePrefix))) {
    const id = `minecraft:${file.path.slice(source.biomePrefix.length, -5)}`;
    const spawnGroups = data.attributes?.["minecraft:gameplay/natural_mob_spawns"]?.argument?.spawns_by_category
      ?? data.spawners ?? {};
    const spawns = Object.entries(spawnGroups).flatMap(([category, entries]) =>
      (Array.isArray(entries) ? entries : []).map(entry => ({ category, entry })));
    const related = [...new Map(spawns.flatMap(({ category, entry }) => {
      const entity = resourceId(entry?.type), group = countFrom(entry?.count)
        ?? countFrom({ min: entry?.minCount, max: entry?.maxCount });
      const weight = entry?.weight;
      return entity ? [[entity, { kind: "entity", id: entity,
        ...(group && group.min > 0 && Number.isSafeInteger(weight) && weight > 0
          ? { spawn: { category, weight, group } } : {}) }]] : [];
    })).values()].slice(0, 256);
    for (const ref of related) addSubject("entity", ref.id);
    const featureCount = (Array.isArray(data.features) ? data.features : []).flat().length;
    const details = [`Temperature ${data.temperature ?? 0}; downfall ${data.downfall ?? 0}.`,
      `${data.has_precipitation ? "Has" : "Has no"} precipitation.`, `${featureCount} placed features and ${related.length} spawnable entity types are declared.`];
    addSubject("biome", id, details.join(" "), source.translations?.[`biome.minecraft.${id.split(":")[1]}`] ?? title(id.split(":")[1]));
    mechanics.push({ id: `minecraft:mechanic/biome/${id.split(":")[1]}`, kind: "generation", subject: { kind: "biome", id },
      text: english(title(id.split(":")[1]), details.join(" ")), requirements: [], inputs: [], outputs: [], related,
      provenance: provenance(file, source) });
  }

  const pools = new Map(parsed.filter(entry => entry.file.path.startsWith(source.templatePoolPrefix)).map(({ file, data }) =>
    [`minecraft:${file.path.slice(source.templatePoolPrefix.length, -5)}`, data]));
  const placements = new Map();
  for (const { data } of parsed.filter(entry => entry.file.path.startsWith(source.structureSetPrefix))) {
    for (const member of Array.isArray(data.structures) ? data.structures : []) placements.set(member.structure, data.placement);
  }
  for (const { file, data } of parsed.filter(entry => entry.file.path.startsWith(source.structurePrefix))) {
    const rawId = `minecraft:${file.path.slice(source.structurePrefix.length, -5)}`, id = structureFamily(rawId);
    addSubject("poi", id);
    const placement = placements.get(rawId), pool = pools.get(data.start_pool), details = [];
    if (data.biomes) details.push(`Biomes: ${String(data.biomes).replace(/^#/, "")}.`);
    if (data.step) details.push(`Generation step: ${title(data.step)}.`);
    if (placement?.spacing) details.push(`Region spacing ${placement.spacing} chunks; minimum separation ${placement.separation ?? 0}.`);
    if (Array.isArray(pool?.elements)) details.push(`Starting template pool: ${pool.elements.length} entries.`);
    mechanics.push({ id: `minecraft:mechanic/generation/${rawId.split(":")[1]}`, kind: "generation", subject: { kind: "poi", id },
      text: english(title(rawId.split(":")[1]), details.join(" ") || "World-generation settings for this structure variant."),
      requirements: [], inputs: [], outputs: [], related: [], provenance: provenance(file, source) });
  }

  return { schemaVersion: 1, kind: "mechanics-catalog", source: { edition: source.edition, version: source.version,
    revision: source.revision, title: "Official Java gameplay data",
    url: `https://github.com/${source.repository}/tree/${source.revision}/data/minecraft` },
  report: { mechanics: mechanics.length, subjects: subjects.size, issues: issues.length, redistributionApproved: false,
    lootTables: mechanics.filter(entry => ["drop", "breaking", "loot"].includes(entry.kind)).length,
    trades: mechanics.filter(entry => entry.kind === "trade").length,
    enchantments: enchantments.length, advancements: advancements.length,
    biomes: parsed.filter(entry => entry.file.path.startsWith(source.biomePrefix)).length,
    structures: parsed.filter(entry => entry.file.path.startsWith(source.structurePrefix)).length },
  subjects: [...subjects.values()], mechanics, issues };
};
