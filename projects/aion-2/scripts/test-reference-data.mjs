import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "public");
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const index = await read("data/reference/index.json");
const catalog = await read("data/items/catalog.json");
const manifest = await read("data/reference/manifest.json");
const items = new Set(catalog.items.map((item) => item.id));
const entries = new Map(index.entries.map((entry) => [entry.id, entry]));
assert.equal(entries.size, index.entries.length, "Reference identities must be unique");
const locale = await readFile("src/i18n/locales/en.json", "utf8").then(JSON.parse);
const translate = (key) => key.split(".").reduce((value, part) => value?.[part], locale);
const mapMarkers = new Map();
for (const folder of await readdir(join(root, "maps"))) {
  const map = await read(`maps/${folder}/metadata.json`);
  const points = [...map.locations];
  for (const file of await readdir(join(root, "maps", folder))) {
    if (file.endsWith(".json") && file !== "metadata.json") {
      const layer = await read(`maps/${folder}/${file}`);
      points.push(...layer.locations);
    }
  }
  mapMarkers.set(folder, new Map(points.map((point) => [point.id, point])));
}
let linkCount = 0;
let locations = 0;
const validateLink = (link) => {
  assert(link && typeof link.name === "string" && link.name.trim(), "Links need a readable name");
  if (link.category === "items") assert(items.has(link.id), `Unknown item ${link.id}`);
  else assert.equal(entries.get(link.id)?.category, link.category, `Broken reference ${link.id}`);
  if (link.quantity !== undefined) assert(Number.isFinite(link.quantity) && link.quantity >= 0, `Invalid quantity for ${link.id}`);
  linkCount++;
};
const validateFacts = (facts = []) => {
  for (const fact of facts) {
    assert.equal(typeof translate(fact.label), "string", `Missing label ${fact.label}`);
    assert(["string", "number", "boolean"].includes(typeof fact.value));
    if (typeof fact.value === "number") assert(Number.isFinite(fact.value));
  }
};
const validateSections = (sections) => {
  assert.equal(new Set(sections.map((s) => s.title)).size, sections.length, "Repeated section headings");
  for (const section of sections) {
    assert.equal(typeof translate(section.title), "string", `Missing section title ${section.title}`);
    if (section.summary) {
      assert.equal(typeof translate(section.summary.key), "string", `Missing summary ${section.summary.key}`);
      assert(Object.values(section.summary.values).every(Number.isFinite), "Summary values must be finite");
    }
    if (section.summaryNotice) assert.equal(typeof translate(section.summaryNotice), "string");
    validateFacts(section.facts);
    section.links?.forEach(validateLink);
    for (const row of section.rows ?? []) { validateFacts(row.facts); row.links?.forEach(validateLink); }
  }
};
const verified = new Set();
for (const category of index.categories) {
  let count = 0;
  for (const file of await readdir(join(root, "data/reference", category.id))) {
    const chunk = await read(`data/reference/${category.id}/${file}`);
    for (const entry of Object.values(chunk.entries)) {
      assert(entries.has(entry.id));
      assert.equal(entry.category, category.id);
      assert.equal(entries.get(entry.id).chunk, file.replace(".json", ""));
      assert(entry.source.includes(".dat#"), `Missing provenance: ${entry.id}`);
      assert(!/\{(?:se|abe)[^}]*\}/.test(entry.description ?? ""), `Unresolved markup: ${entry.id}`);
      validateFacts(entry.facts);
      validateSections(entry.sections);
      for (const location of entry.locations) {
        assert(mapMarkers.get(location.mapId)?.has(location.markerId), `Unknown location for ${entry.id}`);
        locations++;
      }
      for (const node of entry.board ?? []) { assert(node.row >= 1 && node.row <= 15 && node.column >= 1 && node.column <= 15); assert(node.cost >= 0); validateFacts(node.facts); node.links.forEach(validateLink); }
      verified.add(entry.id);
      count++;
    }
  }
  assert.equal(count, category.count);
  assert.equal(count, manifest.categories[category.id]);
}
assert.equal(verified.size, entries.size);
let skillDamageCount = 0;
const skillHealingIds = new Set();
for (let number = 0; number < 256; number++) {
  const bucket = number.toString(16).padStart(2, "0");
  const chunk = await read(`data/reference/skill-damage/${bucket}.json`);
  for (const [id, damage] of Object.entries(chunk.skills)) {
    assert.equal(entries.get(id)?.category, "skills", `Unknown skill damage identity: ${id}`);
    assert(damage.effects.length > 0 || damage.healing?.length > 0, `Missing skill values: ${id}`);
    for (const effect of damage.effects) {
      assert.equal(effect.levels[0][0], 1, `Missing base damage level: ${id}`);
      assert(effect.levels.every((row, index) => row.length === 5 && row.every((value) => Number.isFinite(value) && value >= 0)
        && (index === 0 || row[0] > effect.levels[index - 1][0])), `Invalid damage levels: ${id}`);
    }
    const rangeCount = [...(damage.description ?? "").matchAll(/…\s*[-–]\s*…(?=\s+(?:\w+\s+)?damage\b)/gi)].length;
    if (rangeCount) {
      assert(damage.damageRanges, `Missing damage range links: ${id}`);
      const effectIds = new Set(damage.effects.map((effect) => effect.id));
      assert.equal(damage.damageRanges.length, rangeCount,
        `Damage range count differs from description: ${id}`);
      assert(damage.damageRanges.every((pair) => pair === null || (pair.length === 2 && pair.every((effectId) => effectIds.has(effectId)))),
        `Damage range references unknown effects: ${id}`);
    }
    for (const effect of damage.healing ?? []) {
      assert.equal(effect.levels[0][0], 1, `Missing base healing level: ${id}`);
      assert(effect.levels.every((row, index) => row.length === 3 && row.every((value) => Number.isFinite(value) && value >= 0)
        && (index === 0 || row[0] > effect.levels[index - 1][0])), `Invalid healing levels: ${id}`);
    }
    if (damage.healing?.length) skillHealingIds.add(id);
    skillDamageCount++;
  }
}
assert(skillDamageCount >= 2, "Skill damage previews must include the known damage descriptions");
const snareDamage = await read("data/reference/skill-damage/87.json");
assert.deepEqual(snareDamage.skills["Skill:14130000"].effects[0].levels.find((row) => row[0] === 14), [14, 1027, 1027, 10900, 10900]);
const snipeDamage = await read("data/reference/skill-damage/1a.json");
assert.deepEqual(snipeDamage.skills["Skill:14020000"].effects[0].levels.find((row) => row[0] === 18), [18, 481, 481, 3960, 3960]);
assert(snipeDamage.skills["Skill:14020000"].description.startsWith("Deals "), "Show Snipe's effect description instead of its Mobile tag");
const protectionArmor = await read("data/reference/skill-damage/47.json");
assert.deepEqual(protectionArmor.skills["Skill:11720000"].healing[0].levels.find((row) => row[0] === 1), [1, 53, 64]);
assert.deepEqual(protectionArmor.skills["Skill:11720000"].healing[0].levels.find((row) => row[0] === 14), [14, 509, 611]);
const deadshot = await read("data/reference/skill-damage/04.json");
assert.deepEqual(deadshot.skills["Skill:14010020"].damageRanges, [["1401000011", "1401000311"]]);
for (const entry of entries.values()) {
  if (entry.category === "skills" && /…\s*[-–]\s*…\s+HP\b/.test(entry.description ?? "")) {
    assert(skillHealingIds.has(entry.id), `Missing healing values for ${entry.id}`);
  }
}
let extendedItems = 0;
for (const file of await readdir(join(root, "data/reference/items"))) {
  const chunk = await read(`data/reference/items/${file}`);
  for (const [id, sections] of Object.entries(chunk.items)) { assert(items.has(id)); validateSections(sections); extendedItems++; }
}
assert.equal(extendedItems, manifest.itemsWithReferenceSections);
const scrollChunk = await read("data/reference/items/531.json");
const scrollEffect = scrollChunk.items["531060005"].find((section) => section.title === "reference.labels.use-effect");
assert.deepEqual(scrollEffect.summary.values, { duration: 60, amount: 350 });
assert.equal(scrollEffect.summaryNotice, "reference.useEffect.unknownShieldTotal");
const scrollSkill = entries.get("Skill:2212001");
const scrollSkillChunk = await read(`data/reference/skills/${scrollSkill.chunk}.json`);
const scrollSkillEffects = scrollSkillChunk.entries[scrollSkill.id].sections.find((section) => section.title === "reference.labels.effects");
assert.deepEqual(scrollSkillEffects.rows.flatMap((row) => row.links.map((link) => link.id)), ["SkillAbnormal:22120011"], "Shield chance must not become an unrelated effect link");
const stoneChunk = await read("data/reference/items/511.json");
const stoneSections = stoneChunk.items["511351002"];
const stoneEffect = stoneSections.find((section) => section.title === "reference.labels.use-effect");
assert(stoneEffect, "Stone use effects must retain their description");
assert.equal(stoneEffect.links?.length ?? 0, 0, "Imprint parameters must not link unrelated skills or tickets");
const stoneResults = stoneSections.find((section) => section.title === "reference.labels.imprint-chances")?.imprintResults;
assert(stoneResults?.length > 0, "Stone imprint probabilities must remain available in upgrades");
const attackResult = stoneResults.find((result) => result.name === "Attack");
assert.equal(attackResult?.chance, 6);
assert.deepEqual(attackResult.results.map((result) => [result.value, result.chance]), [[2, 50], [4, 35], [8, 15]]);
for (const points of mapMarkers.values()) for (const point of points.values()) if (point.reference) assert(entries.has(point.reference.id), `Missing map reference ${point.id}`);
const twilight = await read("data/reference/items/210.json");
assert(twilight.items["210160026"].some((s) => s.links?.some((l) => l.id === "Quest:1101011")), "Known previously missing quest source must stay linked");
assert(catalog.items.filter((item) => item.description).length >= 5780, "Imported descriptions must be preserved");
assert(mapMarkers.get("reshanta-a").size > 1700, "Verified world spawns must stay available");
const boardSummary = entries.get("DaevanionBoard:16");
const boardChunk = await read(`data/reference/boards/${boardSummary.chunk}.json`);
const dualStatNode = boardChunk.entries[boardSummary.id].board.find((node) => node.id === "160006");
assert.equal(dualStatNode.bonuses.length, 2, "Multi-stat board nodes must contribute every bonus");
assert.deepEqual(dualStatNode.bonuses.map((bonus) => bonus.value), [5, 5]);
const wingAchievement = entries.get("Achievement:760424010");
assert.equal(wingAchievement.name, "Draupnir Sweep", "AchievementString titles must replace generic group names");
const wingAchievementChunk = await read(`data/reference/achievements/${wingAchievement.chunk}.json`);
assert.equal(wingAchievementChunk.entries[wingAchievement.id].sections.find((section) => section.title === "reference.labels.milestones").rows[0].description, "Clear Draupnir Sweep");
const abyssAchievement = entries.get("Achievement:230110100");
assert.equal(abyssAchievement.name, "Peering into the Abyss Ⅰ", "Abyss entries must retain their individual titles");
assert.equal(abyssAchievement.unnamed, false);
assert.equal(entries.get("Achievement:100030000").unnamed, true, "Achievements without localized titles stay available as unnamed records");
const wingSources = await read("data/reference/items/562.json");
assert(wingSources.items["562400008"].some((section) => section.links?.some((link) => link.id === wingAchievement.id && link.name === wingAchievement.name)), "Incoming item links must use the achievement title");
console.log(`Reference data valid: ${verified.size} entries, ${extendedItems} extended items, ${linkCount} links, ${locations} map relationships.`);
