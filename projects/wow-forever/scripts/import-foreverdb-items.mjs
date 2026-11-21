import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

const sourceBase = "https://foreverdb.net/data";
const headers = { "User-Agent": "WowForeverMapContentResearch/1.0" };
async function download(name) {
  const response = await fetch(`${sourceBase}/${name}`, { headers });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const [sourceItems, statNames, itemMeta, sourceSets, catalog, spellIndex] = await Promise.all([
  download("items.json"), download("stats.json"), download("itemmeta.json"), download("itemsets.json"),
  readFile("public/data/items/catalog.json", "utf8").then(JSON.parse),
  readFile("public/data/spells/foreverdb/index.json", "utf8").then(JSON.parse),
]);
if (!Array.isArray(sourceItems) || sourceItems.length < 20000 || catalog.version !== 2) {
  throw new Error("Incomplete item catalogs");
}

const localById = new Map(catalog.items.map((item) => [item.id, item]));
const sourceNames = new Map(sourceItems.map((item) => [String(item.id), item.n]));
const sourceSetsByItem = new Map();
for (const set of sourceSets) for (const itemId of set.items ?? []) {
  const id = String(itemId);
  const entries = sourceSetsByItem.get(id) ?? [];
  entries.push({
    id: String(set.id), name: set.n,
    memberItemIds: set.items.map(String),
    members: set.items.map((memberId) => ({ id: String(memberId), name: localById.get(String(memberId))?.name ?? sourceNames.get(String(memberId)) ?? "" })),
    bonuses: (set.bonus ?? []).map(([pieces, spellId, description]) => ({ id: `${set.id}-${pieces}`, requiredPieces: pieces, spellName: description, spellId: String(spellId) })),
  });
  sourceSetsByItem.set(id, entries);
}
const spellNames = new Map(spellIndex.map(([id, name]) => [String(id), name]));
const classNames = { 1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest", 7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid" };
const qualities = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"];
const schoolNames = { 2: "Holy", 3: "Fire", 4: "Nature", 5: "Frost", 6: "Shadow", 7: "Arcane" };
const triggerNames = { 0: "use", 1: "equip", 2: "proc", 4: "use", 5: "use", 6: "use" };
const linkTriggers = { use: "use", equip: "equipped", proc: "chance-on-hit" };
const statAliases = {
  "critical strike": "crit rating", hit: "hit rating", defense: "defense rating",
  dodge: "dodge rating", "mana per 5 sec": "mana regeneration",
  "health per 5 sec": "health regeneration",
  "arcane damage done": "arcane spell damage", "shadow damage done": "shadow spell damage",
  "nature damage done": "nature spell damage", "fire damage done": "fire spell damage",
  "frost damage done": "frost spell damage", "holy damage done": "holy spell damage",
  "physical damage done": "physical spell damage",
  "herbalism skill": "herbalism", "mining skill": "mining", "skinning skill": "skinning",
};
const normalize = (label) => {
  const value = label === "database.clientItem.stat.armor" ? "armor" : label.toLowerCase().trim();
  return statAliases[value] ?? value;
};
const normalizeEffect = (value) => value.trim().toLocaleLowerCase("en")
  .replace(/\b(?:hours?|hrs?)\b/g, "hour")
  .replace(/\b(?:minutes?|mins?)\b/g, "minute")
  .replace(/\b(?:seconds?|secs?)\b/g, "second")
  .replace(/\s+/g, " ");
const signed = (value) => value > 0 ? `+${value}` : String(value);
const classesFor = (mask) => Object.entries(classNames).filter(([id]) => mask & (1 << (Number(id) - 1))).map(([, name]) => name);
const effectsFor = (item) => (item.sp ?? [])
  .filter((effect) => triggerNames[effect[0]] && typeof effect[2] === "string" && effect[2].trim())
  .map(([trigger, id, text]) => ({ kind: triggerNames[trigger], id: String(id), text: text.trim() }));
const statsFor = (item) => {
  const stats = (item.st ?? []).map(([id, value]) => ({ key: `fd-stat-${id}`, label: statNames[id] ?? `Stat ${id}`, value: signed(value) }));
  if (item.ar) stats.unshift({ key: "fd-armor", label: "database.clientItem.stat.armor", value: String(item.ar) });
  if (item.dmg) {
    const [minimum, maximum, school] = item.dmg;
    stats.unshift({ key: "fd-damage", label: "database.clientItem.damage", value: `${minimum}–${maximum}${schoolNames[school] ? ` ${schoolNames[school]}` : ""}` });
    if (item.spd) stats.push({ key: "fd-dps", label: "database.clientItem.dps", value: (((minimum + maximum) / 2) / (item.spd / 1000)).toFixed(1) });
  }
  return stats;
};
const detailsFor = (item) => ({
  ...(item.b ? { bonding: item.b } : {}),
  ...(item.sell ? { sellPriceCopper: item.sell } : {}),
  ...(item.spd ? { itemDelayMs: item.spd } : {}),
  ...(item.slots ? { containerSlots: item.slots } : {}),
  ...(item.inv ? { inventoryType: item.inv } : {}),
});
const changesFor = (item) => {
  const previous = item.chg;
  if (!previous) return undefined;
  return {
    ...(previous.name ? { name: { before: previous.name, after: item.n } } : {}),
    ...(previous.il ? { itemLevel: { before: String(previous.il), after: String(item.il) } } : {}),
    ...(previous.q !== undefined ? { quality: { before: qualities[previous.q] ?? String(previous.q), after: qualities[item.q] ?? String(item.q) } } : {}),
    ...(previous.st ? { stats: {
      before: previous.st.map(([id, value]) => `${signed(value)} ${statNames[id] ?? `Stat ${id}`}`).join(", ") || "—",
      after: (item.st ?? []).map(([id, value]) => `${signed(value)} ${statNames[id] ?? `Stat ${id}`}`).join(", ") || "—",
    } } : {}),
    ...(previous.sp ? { spells: {
      before: previous.sp.map((id) => ({ id: String(id), name: spellNames.get(String(id)) ?? `Spell #${id}` })),
      after: (item.sp ?? []).map(([, id, description]) => ({ id: String(id), name: spellNames.get(String(id)) ?? description ?? `Spell #${id}` })),
    } } : {}),
  };
};
const categoryFor = (item) => {
  const category = itemMeta.classes[item.c] ?? "Miscellaneous";
  const subtype = itemMeta.sub[`${item.c}.${item.sc}`];
  return subtype ? `${category} · ${subtype}` : category;
};

const entries = {};
const newItems = [];
let correctedQualities = 0;
const newItemIconIds = new Map();
const review = { version: 2, source: `${sourceBase}/items.json`, remoteCount: sourceItems.length,
  localCount: catalog.items.length, newItemIds: [], missingStatsAdded: 0,
  missingEffectsAdded: 0, missingItemSetsAdded: 0, conflicts: {}, setBonusConflicts: {} };
for (const remote of sourceItems) {
  const id = String(remote.id);
  const local = localById.get(id);
  const sourceStats = statsFor(remote);
  const sourceEffects = effectsFor(remote);
  const previewReasons = Array.isArray(remote.spec) ? remote.spec.filter((reason) => reason === "cap" || reason === "sod") : [];
  if (!local) {
    if (remote.ic) newItemIconIds.set(id, remote.ic);
    newItems.push({
      id, name: remote.n, category: categoryFor(remote), grade: qualities[remote.q] ?? "Common",
      nameVerified: true, itemLevel: remote.il, usageLevel: remote.rl || undefined,
      forever: Boolean(remote.new), description: remote.d || undefined,
      allowedClasses: remote.cls ? classesFor(remote.cls) : undefined,
      siteEffects: sourceEffects.map(({ kind, text }) => ({ kind, text })),
      spellLinks: sourceEffects.map(({ kind, id: spellId, text }) => ({ id: spellId, name: spellNames.get(spellId) ?? text, trigger: linkTriggers[kind] })),
      itemSets: sourceSetsByItem.get(id) ?? [],
      clientDetails: detailsFor(remote), previewReasons,
      classicChanges: changesFor(remote),
      sections: sourceStats.length ? [{ key: "base", stats: sourceStats }] : [],
      enhancements: [], hasReference: false,
    });
    review.newItemIds.push(id);
    continue;
  }
  const remoteGrade = qualities[remote.q] ?? "Common";
  if (local.grade !== remoteGrade) {
    local.grade = remoteGrade;
    correctedQualities++;
  }
  const localStats = new Map(local.sections.flatMap((section) => section.stats).map((stat) => [normalize(stat.label), stat.value]));
  const extraStats = sourceStats.filter((stat) => !localStats.has(normalize(stat.label)));
  const conflictingStats = sourceStats.filter((stat) => localStats.has(normalize(stat.label))
    && localStats.get(normalize(stat.label)) !== stat.value);
  const localEffects = new Set((local.siteEffects ?? []).map((effect) => normalizeEffect(effect.text)));
  const extraEffects = sourceEffects.filter((effect) => !localEffects.has(normalizeEffect(effect.text)));
  const localSpellIds = new Set((local.spellLinks ?? []).map((spell) => spell.id));
  const extraSpells = sourceEffects.filter((effect) => !localSpellIds.has(effect.id));
  const localDetails = local.clientDetails ?? {};
  const extraDetails = Object.fromEntries(Object.entries(detailsFor(remote)).filter(([key]) => localDetails[key] === undefined));
  const localSets = new Map((local.itemSets ?? []).map((set) => [set.id, set]));
  const extraSets = (sourceSetsByItem.get(id) ?? []).filter((set) => !localSets.has(set.id));
  const current = {};
  if (remote.n && remote.n !== local.name) current.name = remote.n;
  if (remote.il && remote.il !== local.itemLevel) current.itemLevel = remote.il;
  if (remote.rl && remote.rl !== local.usageLevel) current.usageLevel = remote.rl;
  const remoteClasses = remote.cls ? classesFor(remote.cls) : [];
  if (remote.cls && JSON.stringify(remoteClasses) !== JSON.stringify(local.allowedClasses ?? [])) current.allowedClasses = remoteClasses;
  if (sourceStats.length && (extraStats.length || conflictingStats.length || localStats.size !== sourceStats.length)) {
    current.stats = sourceStats;
  }
  const remoteSiteEffects = sourceEffects.map(({ kind, text }) => ({ kind, text }));
  if (remoteSiteEffects.length >= (local.siteEffects?.length ?? 0) && remoteSiteEffects.length
    && JSON.stringify(remoteSiteEffects) !== JSON.stringify(local.siteEffects ?? [])) current.siteEffects = remoteSiteEffects;
  const remoteSpellLinks = sourceEffects.map(({ kind, id: spellId, text }) => ({ id: spellId, name: spellNames.get(spellId) ?? text, trigger: linkTriggers[kind] }));
  if (remoteSpellLinks.length && JSON.stringify(remoteSpellLinks) !== JSON.stringify(local.spellLinks ?? [])) current.spellLinks = remoteSpellLinks;
  const remoteSets = sourceSetsByItem.get(id) ?? [];
  if (remoteSets.length && JSON.stringify(remoteSets) !== JSON.stringify(local.itemSets ?? [])) current.itemSets = remoteSets;
  for (const sourceSet of sourceSetsByItem.get(id) ?? []) {
    const localSet = localSets.get(sourceSet.id);
    if (!localSet) continue;
    const divergent = sourceSet.bonuses.filter((bonus) => {
      const existing = localSet.bonuses?.find((item) => item.requiredPieces === bonus.requiredPieces);
      return existing && existing.spellName.trim() !== bonus.spellName.trim();
    });
    if (divergent.length) review.setBonusConflicts[`${id}|${sourceSet.id}`] = divergent.map((bonus) => ({ pieces: bonus.requiredPieces, source: bonus.spellName, local: localSet.bonuses.find((item) => item.requiredPieces === bonus.requiredPieces).spellName }));
  }
  const addition = {
    ...(Object.keys(current).length ? { current } : {}),
    ...(extraStats.length ? { stats: extraStats } : {}),
    ...(extraEffects.length ? { siteEffects: extraEffects.map(({ kind, text }) => ({ kind, text })) } : {}),
    ...(extraSpells.length ? { spellLinks: extraSpells.map(({ kind, id: spellId, text }) => ({ id: spellId, name: spellNames.get(spellId) ?? text, trigger: linkTriggers[kind] })) } : {}),
    ...(Object.keys(extraDetails).length ? { clientDetails: extraDetails } : {}),
    ...(!local.description && remote.d ? { description: remote.d } : {}),
    ...(!local.allowedClasses?.length && remote.cls ? { allowedClasses: classesFor(remote.cls) } : {}),
    ...(!local.itemLevel && remote.il ? { itemLevel: remote.il } : {}),
    ...(!local.usageLevel && remote.rl ? { usageLevel: remote.rl } : {}),
    ...(remote.new && !local.forever ? { forever: true } : {}),
    ...(previewReasons.length ? { previewReasons } : {}),
    ...(remote.chg ? { classicChanges: changesFor(remote) } : {}),
    ...(extraSets.length ? { itemSets: extraSets } : {}),
  };
  if (Object.keys(addition).length) entries[id] = addition;
  review.missingStatsAdded += extraStats.length;
  review.missingEffectsAdded += extraEffects.length;
  review.missingItemSetsAdded += extraSets.length;
  if (conflictingStats.length) review.conflicts[id] = {
    item: local.name, stats: conflictingStats.map((stat) => ({ label: stat.label, remote: stat.value, local: localStats.get(normalize(stat.label)) })),
  };
}

const iconRoot = "public/data/items/client-icons";
await mkdir(iconRoot, { recursive: true });
const iconIds = [...new Set(newItemIconIds.values())];
const savedIcons = new Set();
let iconCursor = 0;
async function downloadIconWorker() {
  while (iconCursor < iconIds.length) {
    const iconId = iconIds[iconCursor++];
    const target = `${iconRoot}/${iconId}.webp`;
    try {
      await stat(target);
      savedIcons.add(iconId);
      continue;
    } catch { /* New icon. */ }
    const response = await fetch(`https://foreverdb.net/icons/${iconId}.webp`, { headers });
    if (!response.ok) continue;
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    savedIcons.add(iconId);
  }
}
await Promise.all(Array.from({ length: 8 }, downloadIconWorker));
for (const item of newItems) {
  const iconId = newItemIconIds.get(item.id);
  if (savedIcons.has(iconId)) item.icon = `data/items/client-icons/${iconId}.webp`;
}

await writeFile("public/data/items/foreverdb-enrichment.json", `${JSON.stringify({ version: 2, entries, newItems })}\n`);
await writeFile("public/data/items/catalog.json", `${JSON.stringify(catalog)}\n`);
await writeFile("docs/foreverdb-item-review.json", `${JSON.stringify(review, null, 2)}\n`);
console.log(`Reviewed ${sourceItems.length} full records: ${correctedQualities} qualities corrected, ${Object.keys(entries).length} enriched, ${newItems.length} added with ${savedIcons.size} local icons, ${review.missingStatsAdded} stats, ${review.missingEffectsAdded} effects and ${review.missingItemSetsAdded} set memberships added; ${Object.keys(review.conflicts).length} stat conflicts kept for review.`);
