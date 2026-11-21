/** Classify a deterministic sample of locally present files with unknown archive flags. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = JSON.parse(await readFile(join(root, "data/client-research/archive-flags.json"), "utf8"));
const examples = JSON.parse(await readFile(join(root, "docs/marker-research-examples.json"), "utf8"));
const terms = [...new Set(examples.examples.map(({ name }) => name.toLowerCase()))];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (archive.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Archive inventory and installation belong to different builds");
  }
  let eligible = 0;
  const selected = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (!entry.available || entry.contentFlags !== 0xffffffff || entry.fileSize > 2_000_000) continue;
      eligible++;
      if (eligible % 193 === 0) selected.push({ fileDataId: entry.fileDataId,
        fileName: entry.fileName, size: entry.fileSize });
    }
  } finally { storage.findClose(); }
  const records = [];
  for (const file of selected) {
    let bytes;
    try { bytes = storage.readFile(file.fileName); }
    catch (error) {
      if (error?.codeName !== "ERROR_FILE_ENCRYPTED") throw error;
      records.push({ fileDataId: file.fileDataId, size: file.size, readError: error.codeName });
      continue;
    }
    const head = bytes.subarray(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
    const textLike = bytes.length > 0 && [...bytes.subarray(0, Math.min(bytes.length, 256))]
      .filter((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32 && byte <= 126).length
      / Math.min(bytes.length, 256) > 0.9;
    const value = textLike ? bytes.toString("utf8") : "";
    records.push({ fileDataId: file.fileDataId, size: file.size,
      magic: head, textLike, sha256: createHash("sha256").update(bytes).digest("hex"),
      matchedSeeds: textLike ? terms.filter((term) => value.toLowerCase().includes(term)) : [],
      ...(textLike ? { prefix: value.slice(0, 160).replace(/[^\x20-\x7e\n]/g, ".") } : {}) });
  }
  const magicCounts = Object.fromEntries([...new Set(records.map((record) => record.magic ?? "encrypted"))]
    .map((magic) => [magic, records.filter((record) => (record.magic ?? "encrypted") === magic).length])
    .sort((a, b) => b[1] - a[1]));
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber },
  samplingRule: "Every 193rd locally available unknown-flag file up to 2 MB, in archive enumeration order.",
  eligible, sampleCount: records.length, magicCounts,
  textLikeCount: records.filter((record) => record.textLike).length,
  records };
  await writeFile(join(root, "data/client-research/unknown-archive-sample.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${records.length}/${eligible} unknown-flag files sampled; ${report.textLikeCount} text-like; ${records.filter(({ matchedSeeds }) => matchedSeeds.length).length} seed hits`);
  console.log(JSON.stringify(magicCounts));
} finally { storage.close(); }
