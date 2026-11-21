/** Review locally present text-like archive groups omitted by the first text pass. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = JSON.parse(await readFile(join(root, "data/client-research/archive-flags.json"), "utf8"));
const examples = JSON.parse(await readFile(join(root, "docs/marker-research-examples.json"), "utf8"));
const flags = new Set([39976960, 3670016, 274595840, 271974400, 319946752]);
const terms = [...new Set(examples.examples.map(({ name }) => name.toLowerCase()))];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (archive.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Archive inventory and game installation belong to different builds");
  }
  const files = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && flags.has(entry.contentFlags) && entry.fileSize <= 2_000_000) {
        files.push({ fileDataId: entry.fileDataId, fileName: entry.fileName,
          contentFlags: entry.contentFlags, size: entry.fileSize });
      }
    }
  } finally { storage.findClose(); }
  const records = [];
  for (const file of files) {
    const bytes = storage.readFile(file.fileName);
    const value = bytes.toString("utf8");
    records.push({ fileDataId: file.fileDataId, contentFlags: file.contentFlags,
      size: file.size, sha256: createHash("sha256").update(bytes).digest("hex"),
      prefix: value.slice(0, 220).replace(/[^\x20-\x7e\n]/g, "."),
      matchedSeeds: terms.filter((term) => value.toLowerCase().includes(term)) });
  }
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber }, scannedFlags: [...flags],
  fileCount: records.length,
  rule: "These text-like archive flags were omitted by the first candidate-text scan. A raw name match is only a clue; it does not establish a placed marker.",
  records };
  await writeFile(join(root, "data/client-research/unscanned-text-flags.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Inspected ${records.length} local files; ${records.filter(({ matchedSeeds }) => matchedSeeds.length).length} contain full seed strings`);
  for (const record of records) console.log(record.fileDataId, record.contentFlags,
    record.matchedSeeds.length ? record.matchedSeeds.join(" | ") : record.prefix.slice(0, 50));
} finally { storage.close(); }
