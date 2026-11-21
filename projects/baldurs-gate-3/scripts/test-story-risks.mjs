import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "story-risks.json"));
const sourceRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");

assert.equal(catalog.schemaVersion, 1, "Expected the first curator-verified story-risk schema.");
assert.equal(catalog.stats.risks, 4, "Expected all currently verified critical story rules.");
assert.equal(catalog.stats.targetObjects, 4, "Expected an exact placement target for every story risk.");
assert.equal(catalog.stats.evidenceStatements, 15, "Expected all curator-selected story statements to remain verifiable.");

const riskIds = new Set();
for (const risk of catalog.risks) {
  riskIds.add(risk.id);
  assert(risk.targetObjectId && risk.title && risk.severity === "critical", `${risk.id} is missing its exact identity or severity.`);
  assert(["rest-deadline", "point-of-no-return"].includes(risk.type), `${risk.id} has unsupported type ${risk.type}.`);
  assert(catalog.byTarget[risk.targetObjectId]?.some((entry) => entry.id === risk.id), `${risk.id} is missing from the exact target index.`);
  assert(risk.evidence.length >= 2, `${risk.id} needs multiple exact story statements.`);
  for (const evidence of risk.evidence) {
    assert(Number.isInteger(evidence.sourceLine) && evidence.sourceLine > 0, `${risk.id} has invalid source-line evidence.`);
    const source = fs.readFileSync(path.join(sourceRoot, evidence.provenance), "utf8");
    const line = source.split(/\r?\n/)[evidence.sourceLine - 1];
    assert(line?.includes(evidence.statement), `${risk.id} evidence drifted at ${evidence.provenance}:${evidence.sourceLine}.`);
    if (evidence.occurrence) {
      const matchingLines = source.split(/\r?\n/)
        .flatMap((sourceLine, index) => sourceLine.includes(evidence.statement) ? [index + 1] : []);
      assert.equal(
        evidence.sourceLine,
        matchingLines[evidence.occurrence - 1],
        `${risk.id} evidence no longer points to occurrence ${evidence.occurrence}.`,
      );
    }
  }
}
assert(riskIds.has("nere-suffocation-deadline"), "Expected the verified Nere rest deadline.");
assert(riskIds.has("shadowfell-point-of-no-return"), "Expected the verified Shadowfell point of no return.");
assert(riskIds.has("waukeens-rest-rescue-deadline"), "Expected the verified Waukeen's Rest rescue deadline.");
assert(riskIds.has("mirkon-harpy-cove-deadline"), "Expected the verified Harpy Cove deadline.");

const appearances = [];
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  const locationsPath = path.join(projectRoot, "public", "maps", directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = readJson(contentPath);
  const locations = readJson(locationsPath).locations ?? [];
  const locationsByContent = new Map(locations.map((location) => [location.contentId, location]));
  for (const entity of content.entities ?? []) {
    if (!entity.storyRisks) continue;
    const location = locationsByContent.get(entity.id);
    appearances.push({ mapId: directory.name, entity, location });
    assert(location, `${directory.name}:${entity.id} has no matching story-risk location.`);
    assert(location.categoryFacets?.includes("missable"), `${directory.name}:${entity.id} is missing its verified missable facet.`);
    assert.equal(entity.storyRisks.riskCount, entity.storyRisks.risks.length, `${entity.id} has an incorrect story-risk count.`);
    for (const risk of entity.storyRisks.risks) {
      assert(catalog.byTarget[entity.id.toLocaleLowerCase("en-US")]?.some((entry) => entry.id === risk.id), `${entity.id} exposes unknown story risk ${risk.id}.`);
    }
  }
}

assert(appearances.length >= 2, `Expected at least two mapped story-risk appearances; received ${appearances.length}.`);
assert(appearances.some(({ mapId, entity }) => mapId === "grymforge" && entity.storyRisks.risks.some((risk) => risk.id === "nere-suffocation-deadline")), "Expected Nere's deadline on the unified Grymforge map.");
assert(appearances.some(({ entity }) => entity.storyRisks.risks.some((risk) => risk.id === "shadowfell-point-of-no-return")), "Expected the Shadowfell point-of-no-return marker.");
assert(appearances.some(({ mapId, entity }) => mapId === "wilderness" && entity.storyRisks.risks.some((risk) => risk.id === "waukeens-rest-rescue-deadline")), "Expected the Waukeen's Rest deadline on the Wilderness raster.");
assert(appearances.some(({ mapId, entity }) => mapId === "wilderness" && entity.storyRisks.risks.some((risk) => risk.id === "mirkon-harpy-cove-deadline")), "Expected the Harpy Cove deadline on the Wilderness raster.");

console.log(`Story-risk intelligence: ${catalog.stats.risks} verified rules / ${catalog.stats.evidenceStatements} exact statements; ${appearances.length} marker appearances.`);
