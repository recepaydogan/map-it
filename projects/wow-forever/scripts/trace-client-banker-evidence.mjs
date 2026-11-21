/** Audit local client records for positioned banker or bank evidence. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const names = ["Creature", "GameObjects", "AreaPOI", "AdventureMapPOI",
  "WorldMapOverlay", "AreaTable", "CollectableSourceVendor",
  "CollectableSourceVendorSparse", "GossipNPCOption", "GossipNPCOptionDisplayInfo"];
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const relevant = /\b(bank(?:er|ing)?|vault|atepa)\b/i;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build) {
    throw new Error("The installed client and table catalog have different builds.");
  }
  const tables = [];
  for (const name of names) {
    const registration = byName.get(name);
    if (!registration) throw new Error(`Missing local table registration: ${name}`);
    const bytes = storage.readFile(fileName(registration.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} changed layout since the local catalog was created.`);
    }
    const matches = [];
    const ids = reader.getAllIDs();
    for (const id of ids) {
      const row = reader.getRowData(id);
      const strings = Array.isArray(row)
        ? row.flatMap((field, fieldIndex) => typeof field?.string === "string"
          && relevant.test(field.string)
          ? [{ fieldIndex, value: field.string }] : [])
        : row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
            .filter(([value]) => relevant.test(value))
            .map(([value]) => ({ fieldIndex: null, value })) : [];
      if (!strings.length) continue;
      matches.push({ id, strings,
        relationshipId: reader.getRowRelationship(id) ?? null,
        fields: Array.isArray(row) ? row.map((field, fieldIndex) => ({ fieldIndex,
          ...(field?.string ? { string: field.string } : {}),
          ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
            ? field.data.toString() : field.data } : {}),
        })) : null });
    }
    tables.push({ name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rowCount: ids.length, omittedSections, matches });
  }
  await writeFile(join(root, "data/client-research/banker-evidence-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build }, caveat: "A bank word in a place, interface, or object name does not identify a banker NPC or an interactive service. NPC pins require a named actor joined to a positioned occurrence.",
    tables }, null, 2)}\n`);
  console.log(tables.map(({ name, rowCount, omittedSections, matches }) =>
    `${name}: ${rowCount} rows, ${matches.length} bank-related matches, ${omittedSections.reduce((sum, section) => sum + section.recordCount, 0)} encrypted rows omitted`).join("\n"));
  for (const { name, matches } of tables) {
    for (const { id, strings } of matches) {
      console.log(`${name} ${id}: ${strings.map(({ value }) => value).join(" | ")}`);
    }
  }
} finally {
  storage.close();
}
