/** Search unclassified local archive groups and the client binary for trainer text. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const inventory = JSON.parse(await readFile(join(root, "data/client-research/archive-flags.json"), "utf8"));
const flags = new Set([304480256, 311951360, 1703936, 67239936, 35258368,
  306708480, 40108032, 311558144, 68026368, 274202624]);
const terms = ["trainer", "enchanter", "leatherworker", "blacksmith",
  "first aid", "fishing"];
const chunkSize = 4 * 1024 * 1024;
const overlap = 128;
const scanBytes = (bytes) => {
  const hits = [];
  const counts = Object.fromEntries(terms.map((term) => [term, 0]));
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(bytes.length, offset + chunkSize + overlap);
    const slice = bytes.subarray(offset, end);
    for (const encoding of ["latin1", "utf16le"]) {
      const value = slice.toString(encoding);
      const lower = value.toLowerCase();
      for (const term of terms) {
        let index = lower.indexOf(term);
        while (index !== -1) {
          const byteOffset = offset + index * (encoding === "utf16le" ? 2 : 1);
          if (byteOffset < offset + chunkSize) {
            counts[term] += 1;
            if (hits.filter((hit) => hit.term === term).length < 10) {
              hits.push({ term, encoding, byteOffset,
                context: value.slice(Math.max(0, index - 35), index + term.length + 35)
                  .replace(/[^\x20-\x7e]/g, ".") });
            }
          }
          index = lower.indexOf(term, index + term.length);
        }
      }
    }
  }
  return { counts, hits };
};

const storage = Storage.openEx(installDir,
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== inventory.source.build) throw new Error("Archive inventory belongs to another build.");
  const files = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && flags.has(entry.contentFlags)) files.push({
        fileDataId: entry.fileDataId, fileName: entry.fileName,
        contentFlags: entry.contentFlags, size: entry.fileSize });
    }
  } finally { storage.findClose(); }
  for (const flag of flags) {
    const expected = inventory.groups.find(({ contentFlags }) => contentFlags === flag)?.local;
    if (files.filter(({ contentFlags }) => contentFlags === flag).length !== expected) {
      throw new Error(`Archive group ${flag} changed since inventory.`);
    }
  }
  const groups = [];
  for (const flag of flags) {
    const subset = files.filter(({ contentFlags }) => contentFlags === flag);
    const magicCounts = new Map();
    const hits = [];
    let bytesRead = 0;
    for (const file of subset) {
      const bytes = storage.readFile(file.fileName);
      bytesRead += bytes.length;
      const magic = bytes.subarray(0, 4).toString("hex");
      magicCounts.set(magic, (magicCounts.get(magic) ?? 0) + 1);
      const found = scanBytes(bytes);
      if (found.hits.length) hits.push({ fileDataId: file.fileDataId,
        size: file.size, sha256: createHash("sha256").update(bytes).digest("hex"), ...found });
    }
    groups.push({ contentFlags: flag, files: subset.length, bytesRead,
      magicCounts: Object.fromEntries([...magicCounts].sort((a, b) => b[1] - a[1])),
      hits });
    console.log(`Group ${flag}: ${subset.length} files, ${hits.length} files with trainer/profession terms`);
  }
  const executablePath = join(installDir, "_classic_beta_", "WowB.exe");
  const executable = await readFile(executablePath);
  const executableScan = scanBytes(executable);
  const report = { source: { product: storage.getProductInfo().codeName, build,
    executable: executablePath,
    executableSha256: createHash("sha256").update(executable).digest("hex") },
  scope: "Previously unclassified local archive groups plus the client executable; both single-byte and UTF-16LE text checked.",
  terms, groups, executableScan };
  await writeFile(join(root, "data/client-research/profession-binary-gap-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Executable term counts: ${JSON.stringify(executableScan.counts)}`);
} finally { storage.close(); }
