/** Check whether DungeonEncounter's numeric fields can safely identify portraits. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const encounters = await readJson("data/client-research/instance-encounter-trace.json");
const registrations = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build || build !== encounters.source.build) {
    throw new Error("Encounter artwork audit and local tables belong to different builds.");
  }
  const load = (name) => {
    const registration = registrations.get(name);
    if (!registration) throw new Error(`Missing ${name} registration.`);
    const fileName = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const bytes = storage.readFile(fileName);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout changed since the local table inventory.`);
    }
    return { reader, source: { name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections } };
  };
  const dungeon = load("DungeonEncounter");
  const display = load("CreatureDisplayInfo");
  const models = load("CreatureModelData");
  if (dungeon.source.sha256 !== encounters.source.sha256) {
    throw new Error("Encounter artwork audit uses different DungeonEncounter data.");
  }
  const records = encounters.records.flatMap(({ instanceMapId, name: instanceName,
    encounters: rows }) => rows.map(({ encounterId, name }) => {
    const row = dungeon.reader.getRowData(encounterId);
    if (!Array.isArray(row) || row[0]?.string !== name
      || dungeon.reader.getRowRelationship(encounterId) !== instanceMapId) {
      throw new Error(`Encounter ${encounterId} differs from its source trace.`);
    }
    const rawField5 = row[5]?.data;
    const displayRow = rawField5 ? display.reader.getRowData(rawField5) : null;
    const modelId = displayRow?.[1]?.data;
    const modelRow = modelId ? models.reader.getRowData(modelId) : null;
    if (displayRow && (!Array.isArray(displayRow) || !Number.isInteger(modelId)
      || !Array.isArray(modelRow))) {
      throw new Error(`Uninspectable numeric display collision for encounter ${encounterId}.`);
    }
    return { encounterId, name, instanceName, instanceMapId, rawField5,
      numericDisplayIdCollision: !!displayRow,
      ...(modelId ? { collisionModelId: modelId,
        collisionModelFileDataId: modelRow[2]?.data ?? null } : {}),
    };
  }));
  const maraudon = records.filter(({ instanceMapId }) => instanceMapId === 349);
  const numericCollisions = records.filter(({ numericDisplayIdCollision }) => numericDisplayIdCollision);
  const maraudonModelIds = [...new Set(maraudon.map(({ collisionModelId }) => collisionModelId))];
  if (records.length !== 46 || numericCollisions.length !== 15
    || maraudon.length !== 8 || maraudonModelIds.length !== 2) {
    throw new Error("The numeric encounter/display collision pattern changed; re-evaluate artwork evidence.");
  }
  await writeFile(join(root, "data/client-research/instance-encounter-artwork-audit.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      tables: [dungeon.source, display.source, models.source] },
    summary: { encounters: records.length,
      nonzeroRawField5: records.filter(({ rawField5 }) => rawField5).length,
      numericDisplayIdCollisions: numericCollisions.length,
      maraudonEncounters: maraudon.length,
      maraudonCollisionModelIds: maraudonModelIds },
    conclusion: "A raw DungeonEncounter field numerically overlaps some CreatureDisplayInfo IDs, but these IDs are not a validated relationship. The eight distinct Maraudon encounter names collapse to only two model IDs under this assumption. Do not publish encounter portraits from this field without an independent source join.",
    records }, null, 2)}\n`);
  console.log(`Audited ${records.length} encounter artwork candidates; ${numericCollisions.length} unverified numeric collisions.`);
} finally {
  storage.close();
}
