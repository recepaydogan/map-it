/** Enumerate every client DB2 registration, including absent local files. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const executable = await readFile(join(installDir, "_classic_beta_", "WowB.exe"));
const known = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const peOffset = executable.readUInt32LE(0x3c);
if (executable.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
  throw new Error("The local game executable is not a PE file.");
}
const optionalStart = peOffset + 24;
const imageBase = executable.readBigUInt64LE(optionalStart + 24);
const sectionCount = executable.readUInt16LE(peOffset + 6);
const sectionStart = optionalStart + executable.readUInt16LE(peOffset + 20);
const sections = Array.from({ length: sectionCount }, (_, index) => {
  const offset = sectionStart + index * 40;
  return { virtualAddress: executable.readUInt32LE(offset + 12),
    virtualSize: executable.readUInt32LE(offset + 8),
    rawSize: executable.readUInt32LE(offset + 16),
    rawOffset: executable.readUInt32LE(offset + 20) };
});
const nameAtVa = (va) => {
  const rva = va - imageBase;
  if (rva < 0n || rva > 0xffff_ffffn) return null;
  const address = Number(rva);
  const section = sections.find(({ virtualAddress, virtualSize, rawSize }) =>
    address >= virtualAddress && address < virtualAddress + Math.max(virtualSize, rawSize));
  if (!section) return null;
  const offset = section.rawOffset + address - section.virtualAddress;
  if (offset < 0 || offset >= executable.length) return null;
  const end = executable.indexOf(0, offset);
  if (end < offset || end - offset > 100) return null;
  const name = executable.toString("ascii", offset, end);
  return /^[A-Za-z][A-Za-z0-9_]+$/.test(name) ? name : null;
};

// Verified local WDC5 registrations occupy two dense executable spans. Other
// structures also contain name pointers and integer hashes, so scan only the
// spans anchored by records whose actual WDC5 headers were already checked.
const verifiedOffsets = known.identified.map(({ registrationOffset }) => registrationOffset)
  .sort((a, b) => a - b);
const clusters = [];
for (const offset of verifiedOffsets) {
  const current = clusters.at(-1);
  if (!current || offset - current.max > 1_000_000) {
    clusters.push({ min: offset, max: offset });
  } else {
    current.max = offset;
  }
}
const registrationSpans = clusters.map(({ min, max }) => ({
  min: Math.max(8, min - 4096), max: Math.min(executable.length - 96, max + 4096),
}));
const registrations = new Map();
for (const span of registrationSpans) {
for (let idOffset = span.min; idOffset <= span.max; idOffset += 4) {
  const fileDataId = executable.readUInt32LE(idOffset);
  if (fileDataId < 100_000 || fileDataId > 10_000_000) continue;
  const tableHash = executable.readUInt32LE(idOffset + 84);
  const layoutHash = executable.readUInt32LE(idOffset + 92);
  if (!tableHash || !layoutHash) continue;
  const name = nameAtVa(executable.readBigUInt64LE(idOffset - 8));
  if (!name) continue;
  const key = `${name}:${fileDataId}:${tableHash}:${layoutHash}`;
  const prior = registrations.get(key);
  if (prior && prior.registrationOffset !== idOffset) continue;
  registrations.set(key, { name, fileDataId,
    tableHash: tableHash.toString(16).padStart(8, "0"),
    layoutHash: layoutHash.toString(16).padStart(8, "0"),
    registrationOffset: idOffset });
}
}
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const inventoryIds = new Set(known.identified.map(({ fileDataId }) => fileDataId));
  const records = [...registrations.values()].map((record) => {
    const fileName = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const size = storage.getFileInfo(fileName)?.size;
    return { ...record, localAvailable: size !== undefined && size !== 0xffff_ffff,
      localSize: size !== undefined && size !== 0xffff_ffff ? size : null,
      inWdc5Inventory: inventoryIds.has(record.fileDataId) };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.fileDataId - b.fileDataId);
  for (const table of known.identified) {
    if (!records.some(({ fileDataId, tableHash, layoutHash }) =>
      fileDataId === table.fileDataId && tableHash === table.tableHash
      && layoutHash === table.layoutHash)) {
      throw new Error(`Lost known registration for ${table.name} (${table.fileDataId}).`);
    }
  }
  const extraLocal = records.filter(({ localAvailable, inWdc5Inventory }) =>
    localAvailable && !inWdc5Inventory);
  const output = join(root, "data/client-research/all-table-registrations.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    executableSha256: createHash("sha256").update(executable).digest("hex"),
    registrationSpans,
  }, summary: { registrations: records.length,
    locallyAvailable: records.filter(({ localAvailable }) => localAvailable).length,
    extraLocal: extraLocal.length }, records }, null, 2)}\n`);
  console.log(`Indexed ${records.length} client table registrations; ${extraLocal.length} locally available outside the WDC5 inventory.`);
  for (const { name, fileDataId, localSize } of extraLocal) {
    console.log(`Extra local table: ${name} ${fileDataId} (${localSize} bytes)`);
  }
} finally {
  storage.close();
}
