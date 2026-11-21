/** Inventory native map/POI glyph names before assigning them to markers. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const registration = catalog.identified.find(({ name }) => name === "UiTextureAtlasMember");
if (!registration) throw new Error("UiTextureAtlasMember is not registered in the local client.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("UiTextureAtlasMember layout changed in the local client.");
  }
  const records = reader.getAllIDs().flatMap((id) => {
    const row = reader.getRowData(id);
    const name = row?.[0]?.string;
    return typeof name === "string" && /^(poi|map|dungeon|worldmap)/i.test(name)
      ? [{ memberId: id, name, atlasId: row[2].data,
        size: [row[3].data, row[4].data],
        crop: [row[5].data, row[7].data, row[3].data, row[4].data] }] : [];
  });
  await writeFile(join(root, "data/client-research/map-atlas-icon-candidates.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber, table: registration.name,
      fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections },
    rule: "Native atlas member names beginning with poi, map, dungeon, or worldmap. Name similarity alone does not identify an AreaPOI subtype.",
    records }, null, 2)}\n`);
  console.log(`Profiled ${records.length} native map/POI atlas glyphs.`);
} finally {
  storage.close();
}
