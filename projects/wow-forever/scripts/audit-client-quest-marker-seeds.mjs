/** Search the current installed client for quest/NPC names without external catalogs. */
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const executablePath = join(installDir, "_classic_beta_", "WowB.exe");
const outputPath = join(root, "data/client-research/quest-marker-seed-audit.json");
const terms = process.argv.slice(2).length ? process.argv.slice(2) : ["Mor'zul", "Bloodbringer", "Greshka"];
const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const expression = new RegExp(escaped.join("|"), "gi");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex = (value) => value.toString(16).padStart(8, "0");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const contexts = (bytes) => {
  expression.lastIndex = 0;
  const matches = [];
  const text = bytes.toString("utf8");
  for (const match of text.matchAll(expression)) {
    matches.push({ term: match[0], encoding: "utf8", characterOffset: match.index,
      excerpt: text.slice(Math.max(0, match.index - 65), match.index + match[0].length + 90)
        .replace(/[^\x20-\x7e\u2019]/g, " ").replace(/\s+/g, " ").trim() });
    if (matches.length === 8) break;
  }
  for (const term of terms) {
    for (const variant of new Set([term, term.toLowerCase(), term.toUpperCase()])) {
      const offset = bytes.indexOf(Buffer.from(variant, "utf16le"));
      if (offset >= 0) matches.push({ term, encoding: "utf16le", byteOffset: offset,
        excerpt: bytes.subarray(Math.max(0, offset - 64), offset + variant.length * 2 + 160)
          .toString("utf16le").replace(/[^\x20-\x7e\u2019]/g, " ").trim() });
    }
  }
  return matches;
};

const buildInfoBefore = await readFile(join(installDir, ".build.info"), "utf8");
const executable = await readFile(executablePath);
const pe = executable.readUInt32LE(0x3c);
if (executable.toString("ascii", pe, pe + 4) !== "PE\0\0") throw new Error("Expected the native PE executable.");
const optional = pe + 24;
if (executable.readUInt16LE(optional) !== 0x20b) throw new Error("Expected a PE32+ executable.");
const imageBase = executable.readBigUInt64LE(optional + 24);
const sectionStart = optional + executable.readUInt16LE(pe + 20);
const sections = Array.from({ length: executable.readUInt16LE(pe + 6) }, (_, i) => {
  const offset = sectionStart + i * 40;
  return { size: Math.max(executable.readUInt32LE(offset + 8), executable.readUInt32LE(offset + 16)),
    virtual: executable.readUInt32LE(offset + 12), raw: executable.readUInt32LE(offset + 20) };
});
const nameAtPointer = (pointer) => {
  const delta = pointer - imageBase;
  if (delta < 0n || delta > 0xffffffffn) return null;
  const rva = Number(delta);
  const section = sections.find((entry) => rva >= entry.virtual && rva < entry.virtual + entry.size);
  if (!section) return null;
  const offset = section.raw + rva - section.virtual;
  if (offset < 0 || offset >= executable.length) return null;
  const end = executable.indexOf(0, offset);
  if (end < offset || end - offset > 100) return null;
  const name = executable.toString("ascii", offset, end);
  return /^[A-Za-z][A-Za-z0-9_]+$/.test(name) ? name : null;
};

// These categories contain visual/audio assets, not quest records. Verify their
// current-build signatures before excluding them; unknown categories are read.
const graphicsFlags = new Set([302514176, 34078720, 436731904, 524288, 302514177, 268959744,
  303169536, 34734080, 437387264, 1179648, 269615104, 2484469760, 2483290112, 2216034304,
  2214854656, 302776320, 34340864, 436994048, 786432, 269221888, 336592896, 311033856,
  303562752, 303300608, 306446336, 302645248, 340000768, 308674560, 474218496,
  307101696, 306839552, 306970624, 273285120]);
const assetMagic = new Set(["BLP2", "SKIN", "OggS", "ID3\x03", "ID3\x04", "MD21", "AFM2", "SKL1", "SYHP", "REVM", "RVXT"]);
const db2Flags = new Set([304087040, 270532608]);
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us",
  localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const product = storage.getProductInfo();
  console.log(`Native-only audit: ${product.codeName} build ${product.buildNumber}; ${terms.join(", ")}`);
  const groups = new Map();
  let unavailable = 0;
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (!entry.available) { unavailable++; continue; }
      const entries = groups.get(entry.contentFlags) ?? [];
      entries.push({ fileDataId: entry.fileDataId, fileName: entry.fileName,
        size: entry.fileSize, contentFlags: entry.contentFlags, localeFlags: entry.localeFlags });
      groups.set(entry.contentFlags, entries);
    }
  } finally { storage.findClose(); }
  const skippedGroups = [];
  const errors = [];
  const candidates = [];
  for (const [flags, entries] of groups) {
    let exclude = false;
    if (graphicsFlags.has(flags)) {
      const samples = [];
      for (const index of new Set([0, Math.floor(entries.length / 2), entries.length - 1])) {
        const entry = entries[index];
        let file;
        try {
          file = storage.openFile(entry.fileName);
          samples.push({ fileDataId: entry.fileDataId, magic: file.read(4).toString("latin1") });
        } catch (error) { samples.push({ fileDataId: entry.fileDataId, error: error.codeName ?? error.message }); }
        finally { file?.close(); }
      }
      exclude = samples.length > 0 && samples.every((sample) => assetMagic.has(sample.magic));
      if (exclude) skippedGroups.push({ contentFlags: flags, fileCount: entries.length,
        bytes: entries.reduce((sum, entry) => sum + entry.size, 0), samples });
    }
    if (!exclude) candidates.push(...entries);
  }
  candidates.sort((a, b) => Number(!db2Flags.has(a.contentFlags)) - Number(!db2Flags.has(b.contentFlags)));
  console.log(`Queued ${candidates.length} archive files; ${skippedGroups.reduce((sum, g) => sum + g.fileCount, 0)} graphics/audio files excluded by verified flag signatures.`);
  const matches = [];
  const tables = [];
  let scannedBytes = 0;
  let scannedFiles = 0;
  let lastProgress = Date.now();
  for (const entry of candidates) {
    let bytes;
    try { bytes = storage.readFile(entry.fileName); }
    catch (error) { errors.push({ fileDataId: entry.fileDataId, code: error.codeName ?? error.message }); continue; }
    scannedFiles++;
    scannedBytes += bytes.length;
    const hits = contexts(bytes);
    if (hits.length) {
      const evidence = { ...entry, sha256: hash(bytes), contexts: hits };
      matches.push(evidence);
      console.log(`MATCH file ${entry.fileDataId}: ${hits.map((hit) => hit.term).join(", ")}`);
    }
    if (bytes.toString("ascii", 0, 4) === "WDC5") {
      tables.push({ fileDataId: entry.fileDataId, tableHash: hex(bytes.readUInt32LE(152)),
        layoutHash: hex(bytes.readUInt32LE(156)), sha256: hash(bytes), size: bytes.length,
        headerRows: bytes.readUInt32LE(136), fields: bytes.readUInt32LE(140),
        bytes: bytes.length, matched: hits.length > 0 });
    }
    if (Date.now() - lastProgress >= 15000) {
      console.log(`Read ${scannedFiles}/${candidates.length} files, ${(scannedBytes / 1024 ** 3).toFixed(2)} GiB, ${matches.length} matching files.`);
      lastProgress = Date.now();
    }
  }

  const byId = new Map(tables.map((table) => [table.fileDataId, table]));
  for (let offset = 8; offset + 96 <= executable.length; offset += 4) {
    const table = byId.get(executable.readUInt32LE(offset));
    if (!table || hex(executable.readUInt32LE(offset + 84)) !== table.tableHash
      || hex(executable.readUInt32LE(offset + 92)) !== table.layoutHash) continue;
    const name = nameAtPointer(executable.readBigUInt64LE(offset - 8));
    if (!name) continue;
    if (table.name && table.name !== name) throw new Error(`Conflicting registration for ${table.fileDataId}.`);
    table.name = name;
    table.registrationOffset = offset;
  }
  const rowMatches = [];
  const relevantTables = [];
  for (const table of tables) {
    if (!table.matched && !/Quest|Creature$|GameObjects$|Hotfixes$|QuestHub|Spawn/i.test(table.name ?? "")) continue;
    try {
      const { reader, omittedSections } = readLocalWdc5(storage.readFile(fileName(table.fileDataId)));
      const ids = reader.getAllIDs();
      let stringRows = 0;
      for (const id of ids) {
        const row = reader.getRowData(id);
        const strings = Array.isArray(row) ? row.filter((field) => typeof field.string === "string" && field.string.trim()).map((field) => field.string)
          : row?.type === "sparse" && Buffer.isBuffer(row.data)
            ? [...row.data.toString("utf8").matchAll(/[\x20-\x7e]{4,}/g)].map(([value]) => value) : [];
        if (strings.length) stringRows++;
        const hits = strings.filter((value) => { expression.lastIndex = 0; return expression.test(value); });
        if (hits.length) rowMatches.push({ table: table.name ?? null, fileDataId: table.fileDataId, id,
          relationshipId: reader.getRowRelationship(id) ?? null, strings: hits,
          ...(Array.isArray(row) ? { fields: row.map((field, index) => ({ index,
            ...(typeof field.string === "string" ? { string: field.string } : {}),
            ...(field.data !== undefined ? { data: typeof field.data === "bigint" ? field.data.toString() : field.data } : {}) })) } : {}) });
      }
      relevantTables.push({ ...table, readableRows: ids.length, rowsWithStrings: stringRows, omittedSections });
    } catch (error) { relevantTables.push({ ...table, decodeError: error.message }); }
  }

  const looseFiles = [];
  const looseRoots = [join(installDir, "_classic_beta_/Cache"), join(installDir, "Data/ecache")];
  const pending = [...looseRoots];
  while (pending.length) {
    const dir = pending.pop();
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { pending.push(path); continue; }
      const bytes = await readFile(path);
      const info = await stat(path);
      looseFiles.push({ path, bytes: bytes.length, sha256: hash(bytes),
        modifiedAt: info.mtime.toISOString(), magic: bytes.subarray(0, 4).toString("latin1"), contexts: contexts(bytes) });
    }
  }
  if (await readFile(join(installDir, ".build.info"), "utf8") !== buildInfoBefore) throw new Error("Game build changed during the audit.");
  const report = { source: { ...product, installDir, executablePath, executableSha256: hash(executable),
    auditedAt: new Date().toISOString(), locale: "enUS", online: false }, terms,
    rule: "Only the current installed game's CASC, executable and caches are searched. Graphics/audio flag groups are excluded after current signature samples. Every other locally readable archive file is searched as bytes/text, with matching WDC5 rows decoded. Names, item text and quest objective polygons alone do not establish a quest giver spawn.",
    archive: { unavailableFiles: unavailable, localFiles: [...groups.values()].reduce((sum, entries) => sum + entries.length, 0),
      candidateFiles: candidates.length, scannedFiles, scannedBytes, skippedGroups, errors },
    tables: tables.map(({ bytes, ...table }) => table), relevantTables, matches, rowMatches,
    executableContexts: contexts(executable), looseFiles };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`COMPLETE build ${product.buildNumber}: ${scannedFiles} files, ${tables.length} WDC5 tables, ${rowMatches.length} matching rows. ${outputPath}`);
  console.log(JSON.stringify(rowMatches.map(({ table, id, strings }) => ({ table, id, strings }))));
} finally { storage.close(); }
