/** Crop selected map glyphs from locally available client UI texture atlases. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const selectedNames = new Set(["poi-graveyard-neutral", "poi-majorcity", "poi-town",
  "questnormal", "dungeon", "dungeonskull"]);
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`No locally identified ${name} table.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} changed layout since the local table inventory.`);
  }
  return { record, reader, omittedSections, sha256: sha256(bytes) };
};
try {
  const members = readTable("UiTextureAtlasMember");
  const atlases = readTable("UiTextureAtlas");
  const atlasPixels = new Map();
  const records = [];
  const outputDir = join(root, "public/maps/client-icons/atlas");
  await mkdir(outputDir, { recursive: true });
  for (const id of members.reader.getAllIDs()) {
    const row = members.reader.getRowData(id);
    if (!Array.isArray(row) || !selectedNames.has(row[0]?.string)) continue;
    const name = row[0].string;
    const atlasId = row[2].data;
    const atlasRow = atlases.reader.getRowData(atlasId);
    if (!Array.isArray(atlasRow) || atlasRow[0]?.data !== atlasId) {
      throw new Error(`Missing client texture atlas ${atlasId}.`);
    }
    const textureFileDataId = atlasRow[1].data;
    const width = row[3].data;
    const height = row[4].data;
    const left = row[5].data;
    const right = row[6].data;
    const top = row[7].data;
    const bottom = row[8].data;
    if (right - left !== width || bottom - top !== height
      || left < 0 || top < 0 || right > atlasRow[3].data
      || bottom > atlasRow[4].data) {
      throw new Error(`Invalid crop for client atlas member ${name}.`);
    }
    let texture = atlasPixels.get(textureFileDataId);
    if (!texture) {
      const bytes = storage.readFile(fileName(textureFileDataId));
      const blp = new BLPFile(bytes);
      texture = { bytes, blp };
      atlasPixels.set(textureFileDataId, texture);
    }
    if (texture.blp.width !== atlasRow[3].data || texture.blp.height !== atlasRow[4].data) {
      throw new Error(`Client atlas ${atlasId} dimensions do not match its table.`);
    }
    const outputPath = `maps/client-icons/atlas/${name}.png`;
    await sharp(texture.blp.getPixels(0).readBuffer(), {
      raw: { width: texture.blp.width, height: texture.blp.height, channels: 4 },
    }).extract({ left, top, width, height }).png().toFile(join(root, "public", outputPath));
    records.push({ name, memberId: id, atlasId, textureFileDataId,
      crop: { left, top, width, height }, textureSha256: sha256(texture.bytes),
      path: outputPath });
  }
  if (records.length !== selectedNames.size) {
    throw new Error(`Found ${records.length} of ${selectedNames.size} selected client atlas icons.`);
  }
  const manifest = join(root, "data/client-research/atlas-icons.json");
  await writeFile(manifest, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [members, atlases].map(({ record, sha256: hash, omittedSections }) => ({
      name: record.name, fileDataId: record.fileDataId, sha256: hash, omittedSections,
    })),
  }, records }, null, 2)}\n`);
  console.log(`Extracted ${records.length} client atlas glyphs.`);
} finally {
  storage.close();
}
