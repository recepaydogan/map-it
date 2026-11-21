import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getMapRegionTargetId, resolveMapFocusPoint } from "../src/features/map/map-focus-request.ts";
import { getAcquisitionRegionTarget } from "../src/features/database/acquisition-region-target.ts";

const map = { id: "harbor", displayName: "Harbor", bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 } };
const departure = { id: "gate", x: 30, y: 40 };
const destination = { name: "Landing", x: 800, y: 900 };
const request = { mapId: "harbor", pointId: "gate", destination };
const insetMap = { ...map, navigationBounds: { minX: -3000, minY: -3000, maxX: 4000, maxY: 4000 },
  regions: [{ id: "interior-2", name: "Cave", x: -1500, y: -1000 }] };
assert.equal(resolveMapFocusPoint({ destination: { name: "Cave exit", x: -1500, y: -1000 } }, insetMap, []).x, -1500,
  "Arrival navigation must reach image insets beyond the base tile rectangle");
assert.equal(resolveMapFocusPoint({ pointId: "region:interior-2" }, insetMap, []).name, "Cave");
assert.equal(resolveMapFocusPoint({ destination: { name: "Outside", x: -3001, y: 0 } }, insetMap, []), undefined);
assert.deepEqual(resolveMapFocusPoint({ pointId: "gate" }, map, [departure]), departure);
const arrival = resolveMapFocusPoint(request, map, [departure]);
assert.equal(arrival.x, 800, "Destination navigation must not select the departure marker");
assert.equal(arrival.y, 900);
assert.equal(arrival.name, "Landing");
assert.equal(arrival.subtype, "coordinate", "The landing remains visible even without an existing POI");
const portalOrigin = { mapId: "harbor", markerId: "gate" };
const portalArrival = resolveMapFocusPoint({ mapId: "harbor", destination: { ...destination, returnTo: portalOrigin } }, map, []);
assert.deepEqual(portalArrival.returnTo, portalOrigin, "Portal arrivals must retain the exact source marker for return navigation");
assert.equal(arrival.returnTo, undefined, "Other destination markers must not show a portal return action");
assert.equal(resolveMapFocusPoint(request, { ...map, id: "another-map" }, [departure]), undefined, "Wait for the destination map before focusing");
for (const x of [NaN, Infinity, -1, 1001]) {
  assert.equal(resolveMapFocusPoint({ ...request, destination: { ...destination, x } }, map, []), undefined);
}
console.log("Destination focus and cross-map guards verified.");

const region = { id: "harbor-gardens", name: "Gardens", x: 200, y: 300 };
const regionMap = { ...map, regions: [region] };
const maps = new Map([[map.id, regionMap]]);
const source = { kind: "gather", name: "Herb", mapId: map.id, region: region.name };
const target = getAcquisitionRegionTarget(source, maps);
assert(target, "An authored region on the source map should be clickable");
const focus = resolveMapFocusPoint({ mapId: map.id, pointId: target }, regionMap, []);
assert.equal(focus.name, region.name);
assert.equal(focus.x, region.x);
assert.equal(focus.y, region.y);
assert.equal(focus.subtype, "region", "Area links must not pretend to identify a gathering node");
assert.equal(getAcquisitionRegionTarget({ ...source, mapId: "other-map" }, maps), undefined);
assert.equal(getAcquisitionRegionTarget({ ...source, region: "Missing" }, maps), undefined);
assert.equal(getAcquisitionRegionTarget({ ...source, region: undefined }, maps), undefined);
assert.equal(getAcquisitionRegionTarget(source, new Map()), undefined);
assert.equal(getAcquisitionRegionTarget(source, new Map([[map.id, { ...regionMap, regions: [region, { ...region, id: "duplicate" }] }]])), undefined,
  "Ambiguous region names must stay non-interactive");
for (const x of [NaN, Infinity, -1, 1001]) {
  const invalidMap = { ...regionMap, regions: [{ ...region, x }] };
  assert.equal(getAcquisitionRegionTarget(source, new Map([[map.id, invalidMap]])), undefined);
  assert.equal(resolveMapFocusPoint({ pointId: target }, invalidMap, []), undefined);
}
assert.equal(resolveMapFocusPoint({ mapId: "other-map", pointId: target }, regionMap, []), undefined);
assert.equal(resolveMapFocusPoint({ pointId: "region:missing" }, regionMap, []), undefined);
console.log("Acquisition links resolve only to unambiguous existing regions on the correct map.");

const catalog = JSON.parse(readFileSync(new URL("../public/data/event-entrances.json", import.meta.url), "utf8"));
const referenceIndex = JSON.parse(readFileSync(new URL("../public/data/reference/index.json", import.meta.url), "utf8"));
const summaries = new Map(referenceIndex.entries.map((entry) => [entry.id, entry]));
const mapCache = new Map();
for (const entrance of Object.values(catalog.npcs)) {
  if (!entrance.destinationId) continue;
  assert.equal(entrance.destinationId, `Dungeon:${entrance.mapId}`);
  const summary = summaries.get(entrance.destinationId);
  const dungeon = JSON.parse(readFileSync(new URL(`../public/data/reference/dungeons/${summary.chunk}.json`, import.meta.url), "utf8")).entries[summary.id];
  const targets = dungeon.interiorMaps?.map((target) => ({ mapId: target.mapId, regionId: target.insetId }))
    ?? (dungeon.eventArea ? [dungeon.eventArea] : []);
  assert.ok(targets.length, `${summary.id}: destination needs a map target`);
  for (const target of targets) {
    assert.equal(target.regionId.split("-").at(-1), String(entrance.mapId));
    if (!mapCache.has(target.mapId)) {
      const metadata = JSON.parse(readFileSync(new URL(`../public/maps/${target.mapId}/metadata.json`, import.meta.url), "utf8"));
      mapCache.set(target.mapId, { ...metadata, id: target.mapId, displayName: target.mapId });
    }
    const focused = resolveMapFocusPoint({ mapId: target.mapId, pointId: getMapRegionTargetId(target.regionId) }, mapCache.get(target.mapId), []);
    assert.equal(focused?.regionId, target.regionId, `${summary.id}: open its own dungeon map or event area`);
    assert.equal(focused?.subtype, "region");
  }
}
console.log("Event destinations resolve to their exact dungeon maps and areas.");
