/** Search locally available client text resources for marker seed names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const examples = JSON.parse(await readFile(join(root, "docs/marker-research-examples.json"), "utf8"));
const traceTerms = process.argv.slice(2);
const seedTerms = [...new Set(examples.examples.flatMap(({ name, details }) => [
  name,
  ...Object.entries(details ?? {})
    .filter(([key, value]) => !["side", "description"].includes(key) && typeof value === "string")
    .map(([, value]) => value)
    .map((value) => value.replace(/\s+\((?:Alliance|Horde)\)$/, "")),
]))].filter((value) => value.length >= 4);
seedTerms.push(...["Battered", "Al'Aketh", "Feathermoon", "Warsong Gulch",
  "Wailing Caverns", "Razorfen Kraul", "Nijel's Point", "Zephras"]
  .filter((value) => !seedTerms.includes(value)));
const terms = traceTerms.length ? [...new Set(traceTerms)] : seedTerms;
const expressionByTerm = new Map(terms.map((term) => [term, new RegExp(
  `(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu",
)]));
// These groups were identified as text from the local archive signature sample.
const textFlags = new Set([37224448, 37748736, 39845888, 6291456,
  304611328, 308019200, 305004544, 37879808, 36175872, 4194304]);
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const files = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && textFlags.has(entry.contentFlags) && entry.fileSize <= 2_000_000) {
        files.push({ fileDataId: entry.fileDataId, size: entry.fileSize,
          contentFlags: entry.contentFlags, name: entry.fileName });
      }
    }
  } finally {
    storage.findClose();
  }
  const matches = [];
  const readErrors = [];
  for (const file of files) {
    let bytes;
    try {
      bytes = storage.readFile(file.name);
    } catch (error) {
      if (error?.codeName !== "ERROR_FILE_ENCRYPTED") throw error;
      readErrors.push({ fileDataId: file.fileDataId, code: error.codeName });
      continue;
    }
    const value = bytes.toString("utf8");
    const found = terms.filter((term) => expressionByTerm.get(term).test(value));
    if (found.length) matches.push({ ...file, terms: found,
      ...(traceTerms.length ? { contexts: found.map((term) => {
        const index = value.search(expressionByTerm.get(term));
        return { term, excerpt: value.slice(Math.max(0, index - 80), index + term.length + 80)
          .replace(/\s+/g, " ") };
      }) } : {}) });
  }
  if (traceTerms.length) {
    console.log(`Scanned ${files.length - readErrors.length} local text resources; ${matches.length} files match.`);
    for (const match of matches) console.log(JSON.stringify({
      fileDataId: match.fileDataId, contexts: match.contexts }));
  } else {
    const output = join(root, "data/client-research/local-text-index.json");
    await writeFile(output, `${JSON.stringify({ source: {
      product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber, installDir,
    }, textFlags: [...textFlags], candidateFiles: files.length,
    readableFiles: files.length - readErrors.length,
    readErrors, matches }, null, 2)}\n`);
    console.log(`Scanned ${files.length - readErrors.length} local text resources; ${matches.length} files contain full example names.`);
    for (const match of matches) console.log(match.fileDataId, match.terms.join(" | "));
  }
} finally {
  storage.close();
}
