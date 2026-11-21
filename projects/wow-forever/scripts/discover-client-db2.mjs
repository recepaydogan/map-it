/** Inventory locally available client DB2 files and locate research names. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const examples = JSON.parse(await readFile(join(projectRoot, "docs/marker-research-examples.json"), "utf8"));
const terms = [...new Set(examples.examples.flatMap(({ name, details }) => [
  name,
  ...Object.values(details ?? {}).filter((value) => typeof value === "string"),
  ...name.split(/[^\p{L}]+/u).filter((word) => word.length >= 4),
]))].filter((value) => value.length >= 4);
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const product = "wow_classic_beta";
const db2ContentFlags = new Set([304087040, 270532608]);
const storage = new Storage();
storage.openEx(installDir, { codeName: product, region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const files = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && db2ContentFlags.has(entry.contentFlags)) {
        files.push({ fileDataId: entry.fileDataId, size: entry.fileSize,
          localeFlags: entry.localeFlags, contentFlags: entry.contentFlags,
          name: entry.fileName });
      }
    }
  } finally {
    storage.findClose();
  }
  const matches = [];
  const inventory = [];
  const formats = {};
  for (const [index, file] of files.entries()) {
    const bytes = storage.readFile(file.name);
    const magic = bytes.subarray(0, 4).toString("ascii");
    formats[magic] = (formats[magic] ?? 0) + 1;
    const metadata = { ...file, magic,
      rowCount: magic === "WDC5" ? bytes.readUInt32LE(136) : null,
      tableHash: magic === "WDC5" ? bytes.readUInt32LE(152).toString(16).padStart(8, "0") : null,
      layoutHash: magic === "WDC5" ? bytes.readUInt32LE(156).toString(16).padStart(8, "0") : null };
    inventory.push(metadata);
    const value = bytes.toString("utf8").toLowerCase();
    const found = terms.filter((term) => value.includes(term.toLowerCase()));
    if (found.length) matches.push({ ...metadata, terms: found });
    if ((index + 1) % 100 === 0) console.log(`Inspected ${index + 1}/${files.length} local DB2-flagged files.`);
  }
  const output = join(projectRoot, "data/client-research/local-db2-index.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ source: { product,
    build: storage.getProductInfo().buildNumber, installDir },
    contentFlags: [...db2ContentFlags], scanned: files.length, formats, terms, matches, inventory }, null, 2)}\n`);
  console.log(`Found ${matches.length} matching local files: ${output}`);
  for (const match of matches) console.log(match.fileDataId, match.terms.join(" | "));
} finally {
  storage.close();
}
