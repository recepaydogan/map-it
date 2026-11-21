/** Project locally linked quest POIs only when their UiMap assignment is unique. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const graph = await readJson("data/client-research/quest-poi-graph.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
if (atlas.source?.product !== graph.source.product || atlas.source.build !== graph.source.build) {
  throw new Error("The atlas and quest POIs belong to different client builds.");
}
const assignment = catalog.identified.find(({ name }) => name === "UiMapAssignment");
if (!assignment) throw new Error("UiMapAssignment is not locally available.");
const unpackFloats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Expected packed UiMapAssignment floats.");
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const fileName = `FILE${assignment.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== assignment.layoutHash) {
    throw new Error("UiMapAssignment layout changed since the local table inventory.");
  }
  const assignmentsByUiMap = new Map();
  for (const id of reader.getAllIDs()) {
    const uiMapId = reader.getRowRelationship(id);
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || !Number.isInteger(uiMapId)
      || row[4]?.data !== uiMapId || !Number.isInteger(row[6]?.data)) {
      throw new Error(`Invalid UiMapAssignment ${id}.`);
    }
    const assignments = assignmentsByUiMap.get(uiMapId) ?? [];
    assignments.push({ id, mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6) });
    assignmentsByUiMap.set(uiMapId, assignments);
  }
  const project = createClientWorldProjector(atlas);
  const blobs = graph.quests.map((blob) => {
    const assignments = assignmentsByUiMap.get(blob.mapFieldRaw) ?? [];
    const selected = assignments.length === 1 ? assignments[0] : null;
    return { id: blob.id, questId: blob.questId, questLineId: blob.questLineId,
      index: blob.index, uiMapId: blob.mapFieldRaw,
      uiMapAssignmentId: selected?.id ?? null, worldMapId: selected?.mapId ?? null,
      status: selected ? "mapped" : "ambiguous-or-missing-assignment",
      points: blob.points.map((point) => ({ id: point.id, worldPosition: point.position,
        atlasPosition: selected ? project(selected.mapId, point.position) : null,
        withinUiMapRegion: selected ? point.position[0] >= selected.worldRegion[0]
          && point.position[0] <= selected.worldRegion[3]
          && point.position[1] >= selected.worldRegion[1]
          && point.position[1] <= selected.worldRegion[4] : null })),
    };
  });
  const mapped = blobs.flatMap(({ points }) => points).filter(({ atlasPosition }) => atlasPosition);
  const outsideAtlas = mapped.filter(({ atlasPosition: { x, y } }) =>
    x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY).length;
  const outsideUiMapRegion = mapped.filter(({ withinUiMapRegion }) => !withinUiMapRegion).length;
  const output = join(root, "data/client-research/quest-poi-atlas-projection.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: graph.source.product, build: graph.source.build,
    assignmentFileDataId: assignment.fileDataId,
    assignmentSha256: createHash("sha256").update(bytes).digest("hex"),
    omittedSections,
  }, note: "Quest titles and objective meaning are not verified. POI geometry is not a quest giver pin.",
  summary: { blobs: blobs.length, totalPoints: blobs.reduce((sum, blob) => sum + blob.points.length, 0),
    projectedPoints: mapped.length, outsideAtlas, outsideUiMapRegion }, blobs }, null, 2)}\n`);
  console.log(`Projected ${mapped.length} of ${blobs.reduce((sum, blob) => sum + blob.points.length, 0)} quest POI points; ${outsideAtlas} outside atlas, ${outsideUiMapRegion} outside their UI map region.`);
} finally {
  storage.close();
}
