/** Cross-reference verified settlement areas with local taxi route endpoints. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const settlements = await readJson("data/client-research/published-marker-evidence.json");
const taxi = await readJson("data/client-research/taxi-node-candidates.json");
if (settlements.source.product !== taxi.source.product
  || settlements.source.build !== taxi.source.build) {
  throw new Error("Settlement and taxi evidence belong to different client builds.");
}
const records = settlements.markers.map((settlement) => {
  const { minX, minY, maxX, maxY } = settlement.atlasBounds;
  if (!(minX < maxX && minY < maxY)) {
    throw new Error(`Invalid client map area for ${settlement.locationId}.`);
  }
  const candidates = taxi.nodes.filter((node) => node.status === "position-candidate"
    && node.mapIds.length === 1
    && node.mapIds[0] === settlement.sourceIds.worldMapId
    && node.atlasPosition.x >= minX && node.atlasPosition.x <= maxX
    && node.atlasPosition.y >= minY && node.atlasPosition.y <= maxY)
    .map((node) => ({
      taxiNodeId: node.taxiNodeId,
      atlasPosition: node.atlasPosition,
      observationCount: node.observationCount,
      maxHorizontalDeviation: node.maxHorizontalDeviation,
      routePathIds: [...new Set(node.connections.map(({ pathId }) => pathId))].sort((a, b) => a - b),
      connectedNodeIds: [...new Set(node.connections.map(({ otherTaxiNodeId }) => otherTaxiNodeId))]
        .sort((a, b) => a - b),
    }));
  return { settlementLocationId: settlement.locationId, settlementName: settlement.name,
    settlementOverlayId: settlement.sourceIds.overlayId, atlasBounds: settlement.atlasBounds,
    candidates };
});
const output = join(root, "data/client-research/settlement-taxi-candidates.json");
await writeFile(output, `${JSON.stringify({ source: {
  product: settlements.source.product,
  build: settlements.source.build,
  settlementEvidence: "published-marker-evidence.json",
  taxiEvidence: "taxi-node-candidates.json",
}, rule: "A repeated taxi route endpoint projects inside a named client world-map overlay on the same world map.",
note: "This spatial link does not verify a taxi node name, flight-master NPC, faction, service position, or active route.",
records }, null, 2)}\n`);
console.log(`Linked ${records.reduce((count, record) => count + record.candidates.length, 0)} taxi endpoint candidates to ${records.length} settlement areas.`);
