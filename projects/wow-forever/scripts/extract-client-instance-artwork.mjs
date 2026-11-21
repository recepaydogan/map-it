/** Preserve exact-name instance artwork from the local client. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { WDCReader } from "@rhyster/wow-casc-dbc";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const pathTableId = 1375801;
const pathTableLayoutHash = "618ad009";
const instances = [
  { name: "Scholomance", slug: "scholomance", clientSlug: "scholomance" },
  { name: "Uldaman", slug: "uldaman", clientSlug: "uldaman" },
  { name: "Wailing Caverns", slug: "wailing-caverns", clientSlug: "wailingcaverns" },
  { name: "Maraudon", slug: "maraudon", clientSlug: "maraudon" },
];
const selected = new Map(instances.flatMap(({ name, slug, clientSlug }) => [
  [`interface\\lfgframe\\lfgicon-${clientSlug}.blp`,
    { instanceName: name, name: `${slug}-icon`, kind: "icon" }],
  [`interface\\lfgframe\\ui-lfg-background-${clientSlug}.blp`,
    { instanceName: name, name: `${slug}-background`, kind: "background" }],
]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const tableBytes = storage.readFile(fileName(pathTableId));
  const table = new WDCReader(tableBytes);
  if (table.layoutHash.toString(16).padStart(8, "0") !== pathTableLayoutHash) {
    throw new Error("The client interface path table changed layout.");
  }
  const records = [];
  const outputDir = join(root, "public/maps/client-artwork/instances");
  await mkdir(outputDir, { recursive: true });
  for (const id of table.getAllIDs()) {
    const row = table.getRowData(id);
    if (!Array.isArray(row)) continue;
    const clientPath = `${row[0]?.string ?? ""}${row[1]?.string ?? ""}`;
    const artwork = selected.get(clientPath.toLowerCase());
    if (!artwork) continue;
    const bytes = storage.readFile(fileName(id));
    const blp = new BLPFile(bytes);
    const path = `maps/client-artwork/instances/${artwork.name}.png`;
    await sharp(blp.getPixels(0).readBuffer(), {
      raw: { width: blp.width, height: blp.height, channels: 4 },
    }).png().toFile(join(root, "public", path));
    records.push({ ...artwork, fileDataId: id, clientPath, path,
      width: blp.width, height: blp.height, sourceSha256: sha256(bytes) });
  }
  if (records.length !== selected.size) {
    throw new Error(`Found ${records.length} of ${selected.size} exact-name instance artwork files.`);
  }
  const manifest = join(root, "data/client-research/instance-artwork.json");
  await writeFile(manifest, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    pathTableFileDataId: pathTableId,
    pathTableSha256: sha256(tableBytes),
  }, records }, null, 2)}\n`);
  console.log(`Extracted ${records.length} exact-name instance artwork files.`);
} finally {
  storage.close();
}
