const resourceIdPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i;
const pathName = path => path.slice(path.lastIndexOf("/") + 1, -5);
const title = value => value.split(/[\/_-]+/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const itemId = value => {
  if (typeof value !== "string") return null;
  let result = value.includes(":") ? value : `minecraft:${value}`;
  const pieces = result.split(":");
  if (pieces.length === 3 && /^\d+$/.test(pieces[2])) result = `${pieces[0]}:${pieces[1]}`;
  return resourceIdPattern.test(result) ? result : null;
};
const countFrom = value => {
  if (Number.isSafeInteger(value) && value >= 0) return { min: value, max: value };
  if (value && Number.isSafeInteger(value.min) && Number.isSafeInteger(value.max) && value.min >= 0 && value.max >= value.min)
    return { min: value.min, max: value.max };
  return null;
};
const english = name => ({ en: { name } });
const provenance = (file, source) => ({ path: file.path, revision: source.revision, sha256: file.sha256,
  url: source.sourceUrl ? `${source.sourceUrl}#${encodeURIComponent(file.path)}`
    : `https://github.com/${source.repository}/blob/${source.revision}/${file.path}` });

export const parseJsonc = text => {
  let output = "", string = false, escaped = false, lineComment = false, blockComment = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index], next = text[index + 1];
    if (lineComment) { if (character === "\n") { lineComment = false; output += character; } else output += " "; continue; }
    if (blockComment) {
      if (character === "*" && next === "/") { output += "  "; index++; blockComment = false; }
      else output += character === "\n" ? "\n" : " ";
      continue;
    }
    if (!string && character === "/" && next === "/") { output += "  "; index++; lineComment = true; continue; }
    if (!string && character === "/" && next === "*") { output += "  "; index++; blockComment = true; continue; }
    output += character;
    if (string) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') string = false;
    } else if (character === '"') string = true;
  }
  if (string || blockComment) throw new Error("Unterminated JSON string or comment.");
  return JSON.parse(output);
};

const lootOutputs = data => {
  const found = new Map();
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (value.type === "item") {
      const id = itemId(value.name); if (!id) return;
      let count = { min: 1, max: 1 };
      for (const fn of Array.isArray(value.functions) ? value.functions : []) {
        if (fn?.function !== "set_count") continue;
        const parsed = countFrom(fn.count); if (parsed) count = parsed;
      }
      const current = found.get(id);
      found.set(id, { kind: "item", id, count: current ? {
        min: Math.min(current.count.min, count.min), max: Math.max(current.count.max, count.max),
      } : count });
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(data?.pools);
  return [...found.values()];
};

const tradeRefs = values => {
  if (!Array.isArray(values) || !values.length) return null;
  const refs = [];
  for (const value of values) {
    const id = itemId(value?.item), count = countFrom(value?.quantity ?? 1);
    if (!id || !count) return null;
    refs.push({ kind: "item", id, count });
  }
  return refs;
};

const componentsNamed = (value, name, found = []) => {
  if (!value || typeof value !== "object") return found;
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, name)) found.push(value[name]);
  for (const child of Array.isArray(value) ? value : Object.values(value)) componentsNamed(child, name, found);
  return found;
};

/** Normalizes broad, source-declared Bedrock drop and villager-trade relationships without inventing probabilities. */
export const buildBedrockMechanicsArtifact = (files, source) => {
  const mechanics = [], subjects = new Map(), issues = [];
  const addSubject = (kind, id, name = title(id.split(":")[1])) => {
    const key = `${kind}:${id}`;
    if (!subjects.has(key)) subjects.set(key, { kind, id, text: english(name) });
  };
  const parsed = new Map();
  for (const file of files) {
    try { parsed.set(file.path, parseJsonc(file.text)); }
    catch (error) { issues.push({ path: file.path, code: "invalid-json", message: error.message }); continue; }
  }
  const collectItemIds = value => {
    if (typeof value === "string") {
      const id = itemId(value), path = id?.split(":")[1];
      if (id && value.includes(":") && path && !path.startsWith("itemGroup."))
        addSubject("item", id);
      return;
    }
    if (value && typeof value === "object") for (const child of Array.isArray(value) ? value : Object.values(value)) collectItemIds(child);
  };
  for (const file of files.filter(candidate => candidate.path.startsWith(source.itemCatalogPrefix))) collectItemIds(parsed.get(file.path));
  for (const file of files.filter(candidate => candidate.path.startsWith(source.itemPrefix))) {
    const definition = parsed.get(file.path)?.["minecraft:item"], id = itemId(definition?.description?.identifier);
    if (id) addSubject("item", id);
  }
  const lootOwners = new Map();
  for (const file of files.filter(candidate => candidate.path.startsWith(source.entityPrefix))) {
    const data = parsed.get(file.path), definition = data?.["minecraft:entity"];
    const entityId = itemId(definition?.description?.identifier); if (!entityId) continue;
    addSubject("entity", entityId);
    const visit = value => {
      if (!value || typeof value !== "object") return;
      const table = value["minecraft:loot"]?.table;
      if (typeof table === "string" && table.startsWith("loot_tables/") && !table.includes("..") && !table.includes("\\")) {
        const path = `behavior_pack/${table}`;
        if (!lootOwners.has(path)) lootOwners.set(path, new Set()); lootOwners.get(path).add(entityId);
      }
      for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
    };
    visit(definition);
    const addItemMechanic = (kind, rawItem, suffix, name) => {
      const id = itemId(rawItem); if (!id) return;
      addSubject("entity", entityId);
      addSubject("item", id);
      mechanics.push({ id: `${entityId}/${kind}/${suffix}`, kind, subject: { kind: "entity", id: entityId },
        text: english(name), requirements: [],
        inputs: [{ kind: "item", id, count: { min: 1, max: 1 } }],
        outputs: [], related: [], provenance: provenance(file, source) });
    };
    componentsNamed(definition, "minecraft:tamemount").forEach((component, componentIndex) =>
      (Array.isArray(component?.feed_items) ? component.feed_items : []).forEach((feed, feedIndex) => {
        const rawItem = typeof feed === "string" ? feed : feed?.item, id = itemId(rawItem); if (!id) return;
        addItemMechanic("taming", rawItem, `${componentIndex}/${feedIndex}`,
          `Tame ${title(entityId.split(":")[1])} with ${title(id.split(":")[1])}`);
      }));
    componentsNamed(definition, "minecraft:equippable").forEach((component, componentIndex) =>
      (Array.isArray(component?.slots) ? component.slots : []).forEach((slot, slotIndex) => {
        const accepted = Array.isArray(slot?.accepted_items) ? slot.accepted_items : typeof slot?.item === "string" ? [slot.item] : [];
        accepted.forEach((rawItem, itemIndex) => {
          const id = itemId(rawItem); if (!id) return;
          addItemMechanic("equipment", rawItem, `${componentIndex}/${slotIndex}/${itemIndex}`,
            `Equip ${title(entityId.split(":")[1])} with ${title(id.split(":")[1])}`);
        });
      }));
    componentsNamed(definition, "minecraft:breedable").forEach((component, componentIndex) =>
      (Array.isArray(component?.breed_items) ? component.breed_items : []).forEach((rawItem, itemIndex) => {
        const id = itemId(rawItem); if (!id) return;
        addItemMechanic("breeding", rawItem, `${componentIndex}/${itemIndex}`,
          `Breed ${title(entityId.split(":")[1])} with ${title(id.split(":")[1])}`);
      }));
  }
  for (const file of files) {
    const data = parsed.get(file.path); if (!data) continue;
    if (file.path.startsWith(source.lootPrefix)) {
      const owners = lootOwners.get(file.path), outputs = lootOutputs(data);
      if (!outputs.length) continue;
      const mechanicOwners = owners?.size ? [...owners].map(id => ({ kind: "entity", id }))
        : [{ kind: "loot", id: `minecraft:loot/${file.path.slice(source.lootPrefix.length, -5)}` }];
      for (const owner of mechanicOwners) {
        addSubject(owner.kind, owner.id);
        for (const output of outputs) addSubject("item", output.id);
        mechanics.push({ id: `${owner.id}/drops/${pathName(file.path)}`, kind: owner.kind === "entity" ? "drop" : "loot", subject: owner,
          text: english(`${title(owner.id.split(":")[1])} loot`),
          requirements: [], inputs: [], outputs, related: [], provenance: provenance(file, source) });
      }
      continue;
    }
    if (!file.path.startsWith(source.tradePrefix)) continue;
    const profession = pathName(file.path).replace(/_trades$/, "");
    const ownerId = `minecraft:trade/${profession}`;
    addSubject("trade", ownerId, title(profession));
    const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
    tiers.forEach((tier, tierIndex) => (Array.isArray(tier?.groups) ? tier.groups : []).forEach((group, groupIndex) =>
      (Array.isArray(group?.trades) ? group.trades : []).forEach((trade, tradeIndex) => {
        const inputs = tradeRefs(trade?.wants), outputs = tradeRefs(trade?.gives);
        if (!inputs || !outputs) { issues.push({ path: file.path, code: "unsupported-trade", tierIndex, groupIndex, tradeIndex }); return; }
        for (const ref of [...inputs, ...outputs]) addSubject("item", ref.id);
        const level = tierIndex + 1;
        mechanics.push({ id: `minecraft:villager/trade/${profession}/${tierIndex}/${groupIndex}/${tradeIndex}`, kind: "trade",
          subject: { kind: "trade", id: ownerId },
          text: english(`${title(profession)} trade: ${inputs.map(ref => title(ref.id.split(":")[1])).join(" + ")} for ${outputs.map(ref => title(ref.id.split(":")[1])).join(" + ")}`),
          requirements: [], inputs, outputs, related: [], trade: { level }, provenance: provenance(file, source) });
      })));
  }
  return { schemaVersion: 1, kind: "mechanics-catalog",
    source: { edition: source.edition, version: source.version, revision: source.revision,
      title: "Installed Bedrock gameplay data", url: source.sourceUrl ?? `https://github.com/${source.repository}/tree/${source.revision}/behavior_pack` },
    report: { mechanics: mechanics.length, subjects: subjects.size, issues: issues.length,
      installedLayers: source.installedLayers ?? [], redistributionApproved: false },
    subjects: [...subjects.values()], mechanics, issues };
};
