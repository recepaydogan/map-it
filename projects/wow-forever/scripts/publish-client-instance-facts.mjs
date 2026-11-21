/** Join instance POIs to local MapDifficulty and Difficulty records. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const published = await readJson("data/client-research/published-instance-poi-evidence.json");
const lfg = await readJson("data/client-research/instance-lfg-metadata.json");
const layerPath = "public/maps/world-atlas/locations-instances.json";
const layer = await readJson(layerPath);
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || published.source.build !== build
    || lfg.source.build !== build) {
    throw new Error("Instance POIs and difficulty records belong to different builds.");
  }
  const readTable = (name) => {
    const registration = byName.get(name);
    if (!registration) throw new Error(`Missing ${name} registration.`);
    const fileName = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const bytes = storage.readFile(fileName);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout differs from the local executable.`);
    }
    return { reader, source: { name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
  };
  const mapDifficulties = readTable("MapDifficulty");
  const difficulties = readTable("Difficulty");
  const records = published.markers.map((marker) => {
    const rows = mapDifficulties.reader.getAllIDs().flatMap((rowId) => {
      if (mapDifficulties.reader.getRowRelationship(rowId) !== marker.instanceMapId) return [];
      const row = mapDifficulties.reader.getRowData(rowId);
      const difficultyId = row[2]?.data;
      const difficulty = difficulties.reader.getRowData(difficultyId);
      if (!Array.isArray(difficulty)) throw new Error(`Missing Difficulty ${difficultyId}.`);
      return [{ mapDifficultyId: rowId, difficultyId,
        difficultyName: difficulty[0]?.string ?? "",
        entryRequirementText: row[0]?.string ?? "",
        mapPlayerCountField: row[5]?.data,
        difficultyPlayerCountFields: [difficulty[5]?.data, difficulty[6]?.data],
        lfgNumericField: row[9]?.data }];
    });
    const standard = rows.find(({ difficultyId }) => difficultyId === 1)
      ?? rows.find(({ difficultyId }) => difficultyId === 9);
    const publishedFacts = {};
    if (standard) {
      const [firstCount, secondCount] = standard.difficultyPlayerCountFields;
      if (Number.isSafeInteger(firstCount) && firstCount > 0
        && firstCount === secondCount && firstCount === standard.mapPlayerCountField) {
        publishedFacts.groupSize = firstCount;
      }
      const requirement = /^You must be at least level (\d+) to enter\.$/
        .exec(standard.entryRequirementText);
      if (requirement) publishedFacts.minimumEntryLevel = Number(requirement[1]);
    }
    const lfgRow = lfg.records.find(({ poiId }) => poiId === marker.poiId)
      ?.exactNameLfgRows.find(({ nonzeroNumericFields }) =>
        nonzeroNumericFields.some(({ index, value }) =>
          index === 31 && standard?.lfgNumericField === value));
    return { poiId: marker.poiId, name: marker.name,
      instanceMapId: marker.instanceMapId, rows,
      selectedMapDifficultyId: standard?.mapDifficultyId ?? null,
      exactNameLfgRowId: lfgRow?.rowId ?? null,
      publishedFacts };
  });
  const byPoiId = new Map(records.map((record) => [record.poiId, record]));
  layer.locations = layer.locations.map((location) => {
    const poiId = Number(location.id.replace(/^client-instance-poi-/, ""));
    const record = byPoiId.get(poiId);
    if (!record) throw new Error(`Instance location ${location.id} lacks a difficulty audit.`);
    return { ...location,
      ...(record.publishedFacts.groupSize >= 10 ? { category: "raid" } : {}),
      ...(Object.keys(record.publishedFacts).length
        ? { instanceFacts: record.publishedFacts } : {}) };
  });
  await writeFile(join(root, layerPath), `${JSON.stringify(layer, null, 2)}\n`);
  await writeFile(join(root, "data/client-research/published-instance-fact-evidence.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build, tables: [mapDifficulties.source, difficulties.source],
      lfg: lfg.source.table },
    rule: "The client MapDifficulty relationship supplies the instance Map ID. Only the standard Normal or 40 Player row is shown. Group size is published when MapDifficulty and both Difficulty player-count fields agree. Entry level is parsed only from the exact client requirement sentence.",
    caveat: "An entry requirement is not a recommended level range. These client rows do not establish a precise entrance, current queue availability, or all playable modes.",
    records }, null, 2)}\n`);
  console.log(`Published sourced difficulty facts for ${records.filter(({ publishedFacts }) =>
    Object.keys(publishedFacts).length).length} instance POIs.`);
} finally {
  storage.close();
}
