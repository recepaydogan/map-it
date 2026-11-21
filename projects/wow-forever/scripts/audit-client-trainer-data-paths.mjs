/** Inspect local client-side server-data paths without using external sources. */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const tables = ["Hotfixes", "Creature", "CreatureDifficulty", "CreatureLabel",
  "CreatureMovementInfo", "CreatureXDisplayInfo", "GossipNPCOption",
  "GossipNPCOptionDisplayInfo", "NPCCraftingOrderCustomer", "NPCSounds"];
const indexed = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(installDir,
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== catalog.source.build) {
    throw new Error("Installed client and DB2 catalog differ in build.");
  }
  const hotfixPaths = [];
  const sources = tables.map((name) => {
    const record = indexed.get(name);
    if (!record) throw new Error(`Missing local ${name} table.`);
    const bytes = storage.readFile(`FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
      throw new Error(`${name} layout changed.`);
    }
    const ids = reader.getAllIDs();
    if (name === "Hotfixes") {
      for (const id of ids) {
        const row = reader.getRowData(id);
        const typeName = row?.[0]?.string ?? "";
        if (!/spawn|creature|npc|trainer|gossip|vendor/i.test(typeName)) continue;
        hotfixPaths.push({ id, typeName,
          numericFields: row.slice(1).map((field) => field?.data ?? null) });
      }
    }
    const sample = ids.slice(0, 12).map((id) => ({ id,
      relationshipId: reader.getRowRelationship(id) ?? null,
      fields: reader.getRowData(id)?.map((field, index) => ({ index,
        ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
          ? field.data.toString() : field.data } : {}),
        ...(typeof field?.string === "string" ? { string: field.string } : {}),
      })) ?? null }));
    return { name, fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      decodedRows: ids.length,
      encryptedRows: omittedSections.reduce((sum, section) => sum + section.recordCount, 0),
      sample };
  });
  const looseDatabaseFiles = [];
  const gameplayCacheDirectories = [];
  const pending = [installDir];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (/^(cache|wtf)$/i.test(entry.name)) gameplayCacheDirectories.push(path);
        pending.push(path);
      } else if (/\.(wdb|db2|dbc|sqlite|hotfix)$/i.test(entry.name)
        || /^dbcache\.bin$/i.test(entry.name)) {
        looseDatabaseFiles.push(path);
      }
    }
  }
  const ecache = await readFile(join(installDir, "Data/ecache/data.000"));
  const ecacheInspection = { size: ecache.length,
    hasSpawnLocText: ecache.includes(Buffer.from("SPAWNLOC")),
    hasWdc5Header: ecache.includes(Buffer.from("WDC5")) };
  const executable = await readFile(join(installDir, "_classic_beta_/WowB.exe"));
  const executableText = executable.toString("latin1");
  const cacheFileNames = [...new Set([
    ...executableText.matchAll(/[A-Za-z_]+cache\.wdb/gi),
    ...executableText.matchAll(/[A-Za-z_]+cache\.bin/gi),
  ].map(([name]) => name.toLowerCase()))].sort();
  const report = { source: { product: "wow_classic_beta", build: catalog.source.build },
    scope: "Local hotfix metadata, NPC-adjacent DB2 records, encrypted-row coverage, loose cache files, and executable cache filenames. Hotfixes rows name spawn-related record types but contain no coordinates or trainer names; their numeric fields are not treated as client archive file IDs.",
    hotfixPaths, looseDatabaseFiles, gameplayCacheDirectories, ecacheInspection, cacheFileNames,
    sources };
  await writeFile(join(root, "data/client-research/client-trainer-data-paths.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(sources.map(({ name, decodedRows, encryptedRows }) =>
    `${name}: ${decodedRows} readable, ${encryptedRows} encrypted`).join("\n"));
  console.log(`Spawn-related hotfix metadata entries: ${hotfixPaths.length} (no coordinates or trainer names).`);
} finally {
  storage.close();
}
