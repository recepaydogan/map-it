/** Explain why named client taxi nodes were not published as flight pins. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const identities = await readJson("data/client-research/taxi-node-identities.json");
const published = await readJson("data/client-research/published-flight-point-evidence.json");
const alterac = await readJson("data/client-research/published-alterac-flight-evidence.json");
if (identities.source.build !== published.source.build
  || identities.source.build !== alterac.source.build) {
  throw new Error("Published flight points and taxi source belong to different builds.");
}
const publishedIds = new Set([...published.markers, ...alterac.markers]
  .map(({ taxiNodeId }) => taxiNodeId));
const records = identities.nodes.filter(({ id }) => !publishedIds.has(id)).map((node) => {
  const reasons = [];
  if (!node.atlasPosition) reasons.push("map-outside-current-atlas");
  if (node.routeStatus === "no-route") reasons.push("no-local-route");
  if (node.routeStatus === "unresolved") reasons.push("route-position-not-corroborated");
  if (!node.mountCreatureIds.some((mount) => mount > 0)) reasons.push("no-mount-slot");
  if (node.routeEndpointDistance !== null && node.routeEndpointDistance > 10) {
    reasons.push("route-endpoint-too-far");
  }
  if (!reasons.length) throw new Error(`Unexplained unpublished TaxiNode ${node.id}.`);
  return { taxiNodeId: node.id, name: node.name, mapId: node.mapId,
    worldPosition: node.worldPosition, atlasPosition: node.atlasPosition,
    mountCreatureIds: node.mountCreatureIds, routeStatus: node.routeStatus,
    routeObservationCount: node.routeObservationCount,
    routeEndpointDistance: node.routeEndpointDistance,
    routePathIds: node.routePathIds, reasons };
});
const output = join(root, "data/client-research/unpublished-taxi-node-audit.json");
await writeFile(output, `${JSON.stringify({ source: identities.source,
  publishedCount: publishedIds.size, unpublishedCount: records.length,
  rule: "A named TaxiNode without a corroborated local route is not presented as a usable flight point. Nodes outside the published Azeroth and Alterac Valley maps require their own verified terrain projection.",
  records }, null, 2)}\n`);
console.log(`Audited ${records.length} named TaxiNodes withheld from the published flight layers.`);
