/** Classify every locally present archive file whose content flags are unknown. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const archive = await readJson("data/client-research/archive-flags.json");
const seeds = await readJson("docs/marker-research-examples.json");
const names = [...new Set(seeds.examples.map(({ name }) => name.toLowerCase()))];
const expected = archive.groups.find(({ contentFlags }) => contentFlags === 0xffffffff);
if (!expected) throw new Error("Unknown-flag archive group is absent from the inventory.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== archive.source.build) {
    throw new Error("Archive inventory and game installation belong to different builds.");
  }
  const files = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && entry.contentFlags === 0xffffffff) {
        files.push({ fileDataId: entry.fileDataId, fileName: entry.fileName, size: entry.fileSize });
      }
    }
  } finally { storage.findClose(); }
  if (files.length !== expected.local) throw new Error("Unknown-flag file count changed since the archive inventory.");

  const magicCounts = new Map();
  const otherFiles = [];
  const seedHits = [];
  let encrypted = 0;
  let scannedBytes = 0;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    let bytes;
    try { bytes = storage.readFile(file.fileName); }
    catch (error) {
      if (error?.codeName !== "ERROR_FILE_ENCRYPTED") throw error;
      encrypted++;
      continue;
    }
    scannedBytes += bytes.length;
    const magic = bytes.subarray(0, 4).toString("latin1")
      .replace(/[^\x20-\x7e]/g, ".") || "(empty)";
    magicCounts.set(magic, (magicCounts.get(magic) ?? 0) + 1);
    if (!["BLP2", "OggS", "TVFS"].includes(magic)) {
      const prefix = bytes.subarray(0, Math.min(bytes.length, 256));
      const printable = prefix.length > 0 && [...prefix].filter((byte) =>
        byte === 9 || byte === 10 || byte === 13 || byte >= 32 && byte <= 126).length / prefix.length > 0.9;
      const value = printable ? bytes.toString("utf8") : "";
      const matchedSeeds = printable ? names.filter((name) => value.toLowerCase().includes(name)) : [];
      const record = { ...file, magic, printable,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...(printable ? { prefix: value.slice(0, 160).replace(/[^\x20-\x7e\n]/g, ".") } : {}),
        matchedSeeds };
      otherFiles.push(record);
      if (matchedSeeds.length) seedHits.push(record);
    }
    if ((index + 1) % 10000 === 0) console.log(`Classified ${index + 1}/${files.length} local unknown-flag files.`);
  }
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber },
  rule: "Every locally present unknown-flag archive file was read. Only exact source records can establish positioned map markers.",
  fileCount: files.length, scannedBytes, encrypted,
  magicCounts: Object.fromEntries([...magicCounts].sort((left, right) => right[1] - left[1])),
  otherFiles, seedHits };
  await writeFile(join(root, "data/client-research/unknown-archive-full-scan.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Classified ${files.length} files (${encrypted} encrypted); ${otherFiles.length} non-texture/audio/TVFS files; ${seedHits.length} exact seed hits.`);
  console.log(JSON.stringify(report.magicCounts));
} finally { storage.close(); }
