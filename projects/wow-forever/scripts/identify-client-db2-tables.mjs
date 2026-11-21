/** Match local WDC5 files to table names embedded in the local game executable. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const executablePath = join(installDir, "_classic_beta_", "WowB.exe");
const executable = await readFile(executablePath);
const inventory = JSON.parse(await readFile(join(root, "data/client-research/local-db2-index.json"), "utf8"));
const byFileId = new Map(inventory.inventory.map((record) => [record.fileDataId, record]));

const peOffset = executable.readUInt32LE(0x3c);
if (executable.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
  throw new Error("The local game executable is not a PE file.");
}
const sectionCount = executable.readUInt16LE(peOffset + 6);
const optionalSize = executable.readUInt16LE(peOffset + 20);
const optionalStart = peOffset + 24;
if (executable.readUInt16LE(optionalStart) !== 0x20b) {
  throw new Error("Expected a 64-bit game executable.");
}
const imageBase = executable.readBigUInt64LE(optionalStart + 24);
const sections = Array.from({ length: sectionCount }, (_, index) => {
  const offset = optionalStart + optionalSize + index * 40;
  return {
    virtualSize: executable.readUInt32LE(offset + 8),
    virtualAddress: executable.readUInt32LE(offset + 12),
    rawSize: executable.readUInt32LE(offset + 16),
    rawOffset: executable.readUInt32LE(offset + 20),
  };
});
const fileOffsetForVa = (va) => {
  const rva = va - imageBase;
  if (rva < 0n || rva > 0xffff_ffffn) return null;
  const address = Number(rva);
  const section = sections.find(({ virtualAddress, virtualSize, rawSize }) =>
    address >= virtualAddress && address < virtualAddress + Math.max(virtualSize, rawSize));
  if (!section) return null;
  const offset = section.rawOffset + address - section.virtualAddress;
  return offset < executable.length ? offset : null;
};
const nameAtVa = (va) => {
  const offset = fileOffsetForVa(va);
  if (offset === null) return null;
  const end = executable.indexOf(0, offset);
  if (end < offset || end - offset > 100) return null;
  const name = executable.toString("ascii", offset, end);
  return /^[A-Za-z][A-Za-z0-9_]+$/.test(name) ? name : null;
};

const found = new Map();
// The client registration record stores a table-name pointer immediately before
// the FileDataID; its table and layout hashes follow at fixed offsets. Matching
// both hashes prevents unrelated integer occurrences from being accepted.
for (let offset = 8; offset + 96 <= executable.length; offset += 4) {
  const id = executable.readUInt32LE(offset);
  const record = byFileId.get(id);
  if (!record) continue;
  if (executable.readUInt32LE(offset + 84) !== parseInt(record.tableHash, 16)
    || executable.readUInt32LE(offset + 92) !== parseInt(record.layoutHash, 16)) continue;
  const name = nameAtVa(executable.readBigUInt64LE(offset - 8));
  if (!name) continue;
  const previous = found.get(id);
  if (previous && previous.name !== name) {
    throw new Error(`Conflicting game table names for FileDataID ${id}.`);
  }
  found.set(id, { ...record, name, registrationOffset: offset });
}
const identified = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
const unidentified = inventory.inventory.filter(({ fileDataId }) => !found.has(fileDataId));
const output = join(root, "data/client-research/db2-table-names.json");
await writeFile(output, `${JSON.stringify({ source: {
  product: inventory.source.product, build: inventory.source.build,
  executablePath, executableSha256: createHash("sha256").update(executable).digest("hex"),
  db2FileCount: inventory.scanned,
}, identified, unidentified }, null, 2)}\n`);
console.log(`Identified ${identified.length}/${inventory.scanned} local WDC5 tables from the client executable.`);
for (const term of ["Map", "Taxi", "Quest", "GameObject", "Creature", "Area", "POI", "Instance"]) {
  const names = identified.filter(({ name }) => name.toLowerCase().includes(term.toLowerCase()));
  console.log(`${term}: ${names.map(({ name, fileDataId }) => `${name}=${fileDataId}`).join(", ") || "none"}`);
}
