/** Extract native gathering icons from the installed Forever client. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { WDCReader } from "@rhyster/wow-casc-dbc";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const iconNames = new Map([
  ["inv_misc_flower_02", "herbs"],
  ["inv_ore_copper_01", "ore-veins"],
  ["inv_misc_herb_07", "earthroot"],
  ["inv_jewelry_talisman_03", "mageroyal"],
  ["inv_misc_root_01", "briarthorn"],
  ["inv_misc_herb_10", "silverleaf"],
  ["inv_ore_tin_01", "tin-ore"],
  ["inv_stone_06", "chunk-of-amber"],
]);
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const table = new WDCReader(storage.readFile(fileName(1375801)));
  if (table.layoutHash.toString(16).padStart(8, "0") !== "618ad009") {
    throw new Error("Client file-path table layout changed; review before extracting icons.");
  }
  const found = new Map();
  for (const id of table.getAllIDs()) {
    const row = table.getRowData(id);
    if (!Array.isArray(row)) continue;
    const path = `${row[0]?.string ?? ""}${row[1]?.string ?? ""}`;
    const name = /^Interface\\Icons\\([^\\]+)\.blp$/i.exec(path)?.[1]?.toLowerCase();
    if (iconNames.has(name)) found.set(name, id);
  }
  if (found.size !== iconNames.size) throw new Error("Missing native gathering icon in the installed client.");
  const directory = join(root, "public/maps/client-icons/gathering");
  await mkdir(directory, { recursive: true });
  for (const [name, output] of iconNames) {
    const blp = new BLPFile(storage.readFile(fileName(found.get(name))));
    await sharp(blp.getPixels(0).readBuffer(), {
      raw: { width: blp.width, height: blp.height, channels: 4 },
    }).png().toFile(join(directory, `${output}.png`));
    console.log(`${output}.png: client file ${found.get(name)}, ${blp.width}x${blp.height}`);
  }
} finally {
  storage.close();
}
