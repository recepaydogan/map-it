import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ts from "typescript";
import { getMapScenePossessionGroups } from "../src/features/map/map-scene-possession-groups.ts";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 7,
  "Usage: node --experimental-strip-types scripts/audit-scene-possession-consumer.mjs <full-stage> <scene-catalog> <item-catalog> <before-detail-sha256> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stageArg, sceneArg, itemArg, beforeDetailHash, outputArg] = process.argv.slice(2);
const stage = path.resolve(root, stageArg), output = path.resolve(root, outputArg);
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !fs.existsSync(output));
assert.match(beforeDetailHash, /^[a-f0-9]{64}$/);
const hashes = {};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(value), `Input changed during audit: ${key}`);
  hashes[key] = digest(value);
  return value;
};
const json = (file) => JSON.parse(bytes(file));
const manifest = json(path.join(stage, "stage-manifest.json"));
const sceneCatalog = json(sceneArg), itemCatalog = json(itemArg);
assert(Object.keys(sceneCatalog.hashes ?? {}).length);
for (const [file, hash] of Object.entries(sceneCatalog.hashes)) assert.equal(digest(bytes(file)), hash, `Stale native scene evidence: ${file}`);
assert.equal(path.resolve(root, manifest.sceneContentPath), path.resolve(root, sceneArg));
const profiles = new Map(sceneCatalog.profiles.map((profile) => [profile.id, profile]));
assert.equal(profiles.size, sceneCatalog.profiles.length);
const itemIndex = new Map(itemCatalog.items.map((item) => [item.id, item]));
assert.equal(itemIndex.size, itemCatalog.items.length);
const sourceLines = new Map();
// Ignore formatting outside string literals, retaining quoted values exactly.
const normalizeStatement = (value) => value.replace(/"(?:\\.|[^"\\])*"|\/\/.*|\s+/g, (part) => part.startsWith('"') ? part : "").replace(/;$/, "");
let evidenceStatements = 0;
const verifyEvidence = (entries) => {
  assert(entries?.length, "Missing native source statements");
  for (const evidence of entries) {
    if (!sourceLines.has(evidence.sourcePath)) sourceLines.set(evidence.sourcePath, bytes(evidence.sourcePath).toString("utf8").split(/\r?\n/));
    const line = sourceLines.get(evidence.sourcePath)[evidence.sourceLine - 1];
    assert(line && normalizeStatement(line) === normalizeStatement(evidence.statement), `Source statement mismatch: ${evidence.sourcePath}:${evidence.sourceLine}`);
    evidenceStatements++;
  }
};
const matches = [], seenProfiles = new Set();
let appearances = 0, equipmentScenes = 0, inventoryScenes = 0, itemRows = 0, unresolvedReferences = 0, excludedReviewRows = 0;
for (const mapId of manifest.maps) {
  const content = json(path.join(stage, `public/maps/${mapId}/content.json`));
  const locations = json(path.join(stage, `public/maps/${mapId}/locations.json`)).locations;
  const locationIds = new Set(locations.map((location) => location.id));
  for (const entity of Object.values(content.entities)) {
    appearances++;
    const scene = entity.sceneContext;
    if (!scene) continue;
    const unchangedEntity = JSON.stringify(entity);
    const groups = getMapScenePossessionGroups(scene, itemCatalog.items);
    assert.equal(JSON.stringify(entity), unchangedEntity, "Presentation mutated source content");
    if (!scene.equipmentChange && !scene.inventoryChange) { assert.deepEqual(groups, []); continue; }
    assert(locationIds.has(entity.id), `Scene has no matching marker: ${mapId}/${entity.id}`);
    const profile = profiles.get(scene.id);
    assert(profile && !seenProfiles.has(profile.id)); seenProfiles.add(profile.id);
    assert.equal(entity.storyDestination.characterContentId, profile.characterContentId);
    assert.equal(entity.storyDestination.anchorContentId, profile.anchorContentId);
    for (const field of ["equipmentChange", "inventoryChange"]) assert.deepEqual(scene[field], profile[field]);
    const expectedGroups = [];
    if (profile.equipmentChange) {
      equipmentScenes++;
      const equipment = profile.equipmentChange;
      verifyEvidence(equipment.evidence);
      expectedGroups.push({ id: `${profile.id}:equipment`, conditions: equipment.localizedConditions,
        branches: [{ id: "equipment", items: equipment.items }], unresolved: equipment.unresolvedEntries ?? [] });
    }
    if (profile.inventoryChange) {
      inventoryScenes++;
      const inventory = profile.inventoryChange;
      verifyEvidence(inventory.evidence);
      excludedReviewRows += inventory.branches.filter((branch) => branch.reviewOnly).reduce((sum, branch) => sum + branch.items.length, 0);
      expectedGroups.push({ id: `${profile.id}:inventory`, conditions: inventory.localizedConditions,
        branches: inventory.branches.filter((branch) => !branch.reviewOnly).map((branch) => ({
          id: branch.id, conditions: branch.localizedConditions, items: branch.items,
        })), unresolved: [] });
    }
    assert.equal(groups.length, expectedGroups.length);
    const rowReport = [];
    for (const [index, expected] of expectedGroups.entries()) {
      const actual = groups[index];
      assert.equal(actual.id, expected.id);
      assert.deepEqual(actual.localizedConditions, expected.conditions);
      assert(actual.localizedConditions.en && actual.localizedConditions.tr);
      assert.equal(actual.branches.length, expected.branches.length);
      assert.deepEqual(actual.unresolvedEntries, expected.unresolved);
      for (const unresolved of actual.unresolvedEntries) { verifyEvidence(unresolved.evidence); unresolvedReferences++; }
      for (const [branchIndex, branch] of expected.branches.entries()) {
        const actualBranch = actual.branches[branchIndex];
        assert.equal(actualBranch.id, branch.id);
        assert.deepEqual(actualBranch.localizedConditions, branch.conditions);
        assert.equal(actualBranch.rows.length, branch.items.length);
        for (const [rowIndex, source] of branch.items.entries()) {
          const row = actualBranch.rows[rowIndex], item = itemIndex.get(source.itemId);
          assert.deepEqual(row.source, source);
          assert(item && row.item === item, `Missing or mismatched item details: ${mapId}/${entity.id}/${source.itemId}`);
          assert.equal(item.statsId, source.statsId); assert(item.templateIds.includes(source.templateId));
          assert(source.localizedNames.en && source.localizedNames.tr && Number.isInteger(source.amount) && source.amount > 0);
          for (const language of ["en", "tr"]) assert.equal(source.localizedNames[language], item.localizedNames[language]);
          verifyEvidence(source.evidence);
          assert(!Object.hasOwn(row, "chance") && !Object.hasOwn(row, "certainty"));
          itemRows++;
          rowReport.push({ groupId: actual.id, branchId: branch.id, itemId: item.id, templateId: source.templateId,
            statsId: source.statsId, amount: source.amount });
        }
      }
    }
    matches.push({ mapId, locationId: entity.id, profileId: profile.id, rows: rowReport,
      unresolvedReferences: groups.flatMap((group) => group.unresolvedEntries.map((entry) => entry.statsId)) });
  }
}
assert.deepEqual([...seenProfiles].sort(), sceneCatalog.profiles.filter((profile) => profile.equipmentChange || profile.inventoryChange).map((profile) => profile.id).sort());

// Read the real TSX tree; this is static wiring evidence, not a render/app check.
const detailPath = "src/features/map/map-location-details.tsx", componentPath = "src/features/map/map-scene-possessions.tsx";
const detail = bytes(detailPath).toString("utf8"), component = bytes(componentPath).toString("utf8");
const additions = [
  'import MapScenePossessions from "./map-scene-possessions";\n',
  '        {(content?.sceneContext?.equipmentChange || content?.sceneContext?.inventoryChange) && (\n'
    + '          <MapScenePossessions\n            scene={content.sceneContext}\n'
    + '            selectedItemId={selectedLootItemId}\n            onSelectItem={onSelectLootItem}\n'
    + '          />\n        )}\n\n',
];
let previousDetail = detail;
for (const addition of additions) {
  assert.equal(previousDetail.split(addition).length, 2, "Missing or duplicated scene wiring");
  previousDetail = previousDetail.replace(addition, "");
}
assert.equal(digest(previousDetail), beforeDetailHash, "Unrelated detail-panel content changed");
assert(detail.indexOf("scene={content.sceneContext}") < detail.indexOf("deathLoot={content.deathLoot}"));
const parsed = ts.createSourceFile(componentPath, component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.deepEqual(parsed.parseDiagnostics, []);
const calls = [], tags = [];
const visit = (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === "t") calls.push(node.arguments[0].text);
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node);
  ts.forEachChild(node, visit);
};
visit(parsed);
assert(tags.some((tag) => tag.tagName.getText(parsed) === "MapItemLinkRow"));
assert(!tags.some((tag) => ["MapLootList", "MapLootProfileSection", "dialog"].includes(tag.tagName.getText(parsed))));
for (const expression of ["groups.map", "group.branches.map", "branch.rows.map", "group.unresolvedEntries.map",
  "localized(group.localizedConditions)", "localized(branch.localizedConditions)", 'role="alert"', 'role="status"',
  "item={item}", "onSelect={onSelectItem}", "item.id === selectedItemId", 't("map.details.sourceEvidence")']) assert(component.includes(expression));
const translationKeys = [...new Set(calls)];
assert(translationKeys.every((key) => typeof key === "string"));
let localeFiles = 0;
for (const file of fs.readdirSync(path.join(root, "src/i18n/locales")).filter((file) => file.endsWith(".json"))) {
  const locale = json(`src/i18n/locales/${file}`); localeFiles++;
  for (const key of translationKeys) assert.equal(typeof key.split(".").reduce((value, part) => value?.[part], locale), "string", `Missing existing translation: ${file}/${key}`);
}
for (const file of [import.meta.filename, "src/features/map/map-scene-possession-groups.ts", "src/features/map/map-item-link-row.tsx",
  "src/features/map/map-detail-section.tsx", "src/features/items/use-item-database.ts", "src/features/map/map-loot-profile.tsx",
  "src/features/map/use-map-loot-display-rows.ts", "src/features/map/map-loot-display-rows.ts", "src/features/map/map-loot-utils.ts",
  "src/features/map/types.ts", "src/features/items/types.ts", "src/index.css"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const report = {
  kind: "scene-possession-native-data-consumer-audit", stageRoot: stage, sceneCatalog: path.resolve(root, sceneArg),
  itemCatalog: path.resolve(root, itemArg), beforeDetailHash,
  scope: "Actual full raw stage and real item catalog. Static UI wiring only; no tests, fixtures, rendering, app/browser checks or canonical publication.",
  stats: { maps: manifest.maps.length, appearances, affectedAppearances: matches.length, equipmentScenes, inventoryScenes,
    itemRows, unresolvedReferences, excludedReviewRows, evidenceStatements, itemCatalogEntries: itemIndex.size, localeFiles },
  matches, translationKeys, hashes, errors: [],
};
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: output, ...report.stats, errors: report.errors }));
