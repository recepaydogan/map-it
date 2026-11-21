/** Check whether placed transport signs join to usable client taxi route nodes. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const signs = await readJson("data/client-research/transport-sign-trace.json");
const taxi = await readJson("data/client-research/taxi-node-identities.json");
const routes = await readJson("data/client-research/taxi-path-network.json");
const unpublished = await readJson("data/client-research/unpublished-taxi-node-audit.json");
const build = signs.source.build;
if (taxi.source.build !== build || routes.source.build !== build
  || unpublished.source.build !== build) {
  throw new Error("Transport sign and taxi route sources belong to different client builds.");
}
const matches = new Map([[165549, 34], [165557, 35]]);
const records = signs.signs.map((sign) => {
  const nearbyTaxiNodes = taxi.nodes.filter(({ mapId }) => mapId === sign.mapId)
    .map(({ id, name, worldPosition }) => ({ taxiNodeId: id, name,
      worldDistance: Math.hypot(worldPosition[0] - sign.worldPosition[0],
        worldPosition[1] - sign.worldPosition[1]) }))
    .sort((a, b) => a.worldDistance - b.worldDistance).slice(0, 3);
  const candidateId = matches.get(sign.objectId);
  const candidate = taxi.nodes.find(({ id }) => id === candidateId);
  const audit = unpublished.records.find(({ taxiNodeId }) => taxiNodeId === candidateId);
  const nameMatch = candidate ? {
    taxiNodeId: candidate.id, name: candidate.name,
    mapId: candidate.mapId,
    worldDistance: Math.hypot(candidate.worldPosition[0] - sign.worldPosition[0],
      candidate.worldPosition[1] - sign.worldPosition[1]),
    routeStatus: audit?.routeStatus ?? null,
    routePathIds: routes.paths.filter(({ fromTaxiNodeId, toTaxiNodeId }) =>
      fromTaxiNodeId === candidate.id || toTaxiNodeId === candidate.id)
      .map(({ id }) => id),
  } : null;
  if (candidate && (!audit || candidate.mapId !== sign.mapId)) {
    throw new Error(`Missing transport TaxiNode audit for sign ${sign.objectId}.`);
  }
  const verifiedServiceJoin = Boolean(nameMatch?.worldDistance <= 30
    && audit?.routeStatus === "verified");
  return { objectId: sign.objectId, name: sign.name, mapId: sign.mapId,
    nearbyTaxiNodes, nameMatch,
    verifiedServiceJoin,
    reason: "No sign has both a name-matched transport TaxiNode at its placed position and a corroborated local route endpoint." };
});
if (records.length !== 3 || records[0].nameMatch?.taxiNodeId !== 34
  || records[1].nameMatch?.taxiNodeId !== 35
  || records[2].nameMatch !== null
  || records.some(({ verifiedServiceJoin }) => verifiedServiceJoin)) {
  throw new Error("Transport sign/taxi relationship assumptions changed.");
}
await writeFile(join(root, "data/client-research/transport-route-relation-trace.json"),
  `${JSON.stringify({ source: { product: signs.source.product, build,
    gameObjects: signs.source.gameObjects,
    taxiNodes: { fileDataId: taxi.source.fileDataId, sha256: taxi.source.sha256 },
    taxiPathTables: routes.source.tables },
  caveat: "Name or proximity may guide research, but neither proves an active boat or zeppelin service, destination, or boarding point.",
  signs: records }, null, 2)}\n`);
console.log(`Compared ${records.length} placed transport signs with TaxiNodes and route paths.`);
