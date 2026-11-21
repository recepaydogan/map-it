import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { areReciprocalPortals, createNavigationPortalResolver, createPortalEndpointNormalizer,
  normalizeNavigationPortals, portalDistance, portalInstanceId } from "./lib/navigation-portal.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const point = (x, y = 0, z = 0) => ({ x, y, z });
const fixture = (id, module, level, sourcePosition, targetPosition) => ({ id, module, level, sourcePosition, targetPosition });
const first = fixture("reused-id", "base", "first", point(0), point(20));
const second = fixture("reused-id", "base", "second", point(500), point(520));
const resolver = createNavigationPortalResolver([first, second], {});
assert.equal(resolver({ id: first.id, module: "base", level: "first" }), first);
assert.equal(resolver({ id: second.id, module: "base", level: "second" }), second);
assert.equal(resolver({ id: first.id, module: "base", level: "unrelated", position: point(0) }), null,
  "Proximity alone cannot attach another scene's reusable portal");
const parentResolver = createNavigationPortalResolver([first], { templateTransforms: [
  { childLevel: "child", parentLevel: "first" },
] });
assert.equal(parentResolver({ id: first.id, module: "base", level: "child", position: point(1) }), first);
assert.equal(parentResolver({ id: first.id, module: "base", level: "child", position: point(1, -20) }), first,
  "An authored ladder pivot below its navigation endpoint still matches the same parent instance");
assert.equal(parentResolver({ id: first.id, module: "base", level: "child", position: point(500) }), null,
  "The other instance of a reusable child cannot borrow a distant parent export");
assert.equal(areReciprocalPortals(first, fixture("return", "base", "first", point(20), point(0))), true);
assert.equal(areReciprocalPortals(first, fixture("return", "base", "first", point(20, 30), point(0, 30))), false,
  "Reciprocal endpoints must match in height, not just X/Z");
assert.equal(areReciprocalPortals(first, fixture("return", "base", "second", point(20), point(0))), false);

const transforms = read("map-sources/catalog/level-transforms.json");
const rawPortals = read("map-sources/catalog/navigation-portals.json").portals;
const portals = normalizeNavigationPortals(rawPortals,
  createPortalEndpointNormalizer(read("map-sources/catalog/world-map.json"), transforms));
assert.equal(new Set(portals.map(portalInstanceId)).size, rawPortals.length, "Source instance identities are unique");
const byInstance = new Map(portals.map((portal) => [portal.instanceId, portal]));
const coverage = read("public/maps/coverage-report.json");
const excludedInstances = new Set(coverage.excludedPortals.map(portalInstanceId));
const configuredExclusions = read("map-sources/config/placement-maps.json").coverage.excludedPortalIds;
assert.ok(Object.keys(configuredExclusions).every((key) => key.split("/").length === 3),
  "Exclusions must identify a scene instance, never every reuse of an object UUID");
for (const id of ["29bf04f3-2f52-41d8-91fa-8aac0ad82b03", "ad2fd93d-0dad-4355-bd8f-bce46799414a", "dc1ee6b6-ecde-458f-a411-b8881426f7e7"]) {
  assert.equal(excludedInstances.has(`GustavDev/END_Main/${id}`), false, "Live parent passages are not legacy child exports");
  assert.equal(coverage.portals.find((entry) => portalInstanceId(entry) === `GustavDev/END_Main/${id}`)?.status, "covered");
}
const resolve = createNavigationPortalResolver(portals, transforms);
const edgeDoorId = "7cfeb44e-e17e-44ea-b42e-b2a4a4fca58c";
const edgeDoor = Object.values(read("public/maps/shattered-sanctum/content.json").entities).find(({ id }) => id === edgeDoorId);
assert.ok(edgeDoor?.navigationPortal, "A doorway with a model pivot just outside the raster still publishes its verified passage");
assert.deepEqual(edgeDoor.worldPosition, point(297.4112, 41.05808, -85.93255), "Boundary anchoring preserves the native world position");
const edgeMarker = read("public/maps/shattered-sanctum/locations.json").locations.find(({ contentId }) => contentId === edgeDoorId);
const edgeBounds = read("public/maps/shattered-sanctum/metadata.json").bounds;
assert.ok(edgeMarker && edgeMarker.x >= edgeBounds.minX && edgeMarker.x <= edgeBounds.maxX
  && edgeMarker.y >= edgeBounds.minY && edgeMarker.y <= edgeBounds.maxY, "The displayed doorway anchor is within the raster");
const hatchId = "041d9477-219c-49a1-b2ec-9e5aab4441ff";
assert.equal(resolve({ id: hatchId, module: "GustavDev", level: "CTY_Main_A", position: point(-1109, 7, 94) }), null,
  "The city's submersible hatch must not inherit the prison scene's portal");
assert.equal(resolve({ id: hatchId, module: "GustavDev", level: "IRN_Main_A" })?.level, "IRN_Main_A");
const holeId = "33af82f1-5639-43ba-bde9-38ef75b711eb";
const hole = resolve({ id: holeId, module: "Gustav", level: "WLD_Underdark_C" });
assert.ok(portalDistance(hole.sourcePosition, point(-49.289726, 6.86566, -301.48969)) < 0.001,
  "Local hole coordinates are transformed into world coordinates exactly once");
const parentHole = byInstance.get(`Gustav/WLD_Main_A/${holeId}`);
assert.deepEqual(parentHole.sourcePosition, parentHole.authoredSourcePosition, "World-region exports are not transformed twice");
for (const id of ["3e49f06e-7c45-490e-97a2-a9107d1e51de", "785bd701-2cf4-45b5-8074-55434dd17caa"]) {
  const child = byInstance.get(`GustavDev/BGH_Countinghouse_C/${id}`);
  const parent = byInstance.get(`GustavDev/CTY_Main_A/${id}`);
  assert.equal(child.sourceCoordinateSpace, "template-instance");
  assert.equal(child.sourceWorldLevel, parent.level);
  assert.ok(portalDistance(child.sourcePosition, parent.sourcePosition) < 0.001,
    "Nested template projection reproduces the independent parent navigation export, including height");
  assert.ok(portalDistance(child.targetPosition, parent.targetPosition) < 0.001);
}

// Validate the shipped profiles independently of the builder's lookup choices.
let sourceCount = 0;
let destinationCount = 0;
for (const map of read("public/maps/index.json").maps) {
  for (const entity of Object.values(read(`public/maps/${map.id}/content.json`).entities)) {
    const label = `${map.id}/${entity.id}`;
    if (entity.navigationPortal) {
      const profile = entity.navigationPortal;
      const expected = byInstance.get(profile.instanceId);
      assert.ok(expected, `${label} has a complete source instance identity`);
      assert.equal(excludedInstances.has(profile.instanceId), false, `${label} is not hidden from coverage by a stale exclusion`);
      assert.equal(profile.id, entity.id, `${label} source UUID`);
      assert.deepEqual(profile.sourcePosition, expected.sourcePosition, `${label} world source`);
      assert.deepEqual(profile.targetPosition, expected.targetPosition, `${label} world destination`);
      assert.deepEqual(profile.authoredSourcePosition, expected.authoredSourcePosition, `${label} authored source retained`);
      sourceCount += 1;
    }
    if (entity.navigationDestination) {
      const profile = entity.navigationDestination;
      const expected = byInstance.get(profile.instanceId);
      assert.ok(expected, `${label} destination has a complete source instance identity`);
      assert.equal(profile.portalId, expected.id, `${label} destination UUID`);
      assert.deepEqual(profile.targetPosition, expected.targetPosition, `${label} normalized target`);
      assert.deepEqual(entity.worldPosition, expected.targetPosition, `${label} placed at its own scene's target`);
      destinationCount += 1;
    }
  }
}
console.log(`Navigation portal instance checks passed: ${rawPortals.length} sources, ${sourceCount} published portals, ${destinationCount} destinations.`);
