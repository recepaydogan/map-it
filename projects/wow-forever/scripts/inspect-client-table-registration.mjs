/** Resolve client DB2 registration IDs, including tables missing from local CASC. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const bytes = await readFile(join(installDir, "_classic_beta_", "WowB.exe"));
const peOffset = bytes.readUInt32LE(0x3c);
const optionalStart = peOffset + 24;
const imageBase = bytes.readBigUInt64LE(optionalStart + 24);
const sectionCount = bytes.readUInt16LE(peOffset + 6);
const sectionStart = optionalStart + bytes.readUInt16LE(peOffset + 20);
const sections = Array.from({ length: sectionCount }, (_, index) => {
  const offset = sectionStart + 40 * index;
  return { virtualAddress: bytes.readUInt32LE(offset + 12),
    rawSize: bytes.readUInt32LE(offset + 16), rawOffset: bytes.readUInt32LE(offset + 20) };
});
const vaAtOffset = (offset) => {
  const section = sections.find(({ rawOffset, rawSize }) =>
    offset >= rawOffset && offset < rawOffset + rawSize);
  return section ? imageBase + BigInt(section.virtualAddress + offset - section.rawOffset) : null;
};
const selectedNames = process.argv.slice(2);
const names = selectedNames.length ? selectedNames : [
  "GameObjects", "Creature", "Map", "UiMap", "AreaTable", "AreaPOI",
  "LFGDungeons", "QuestInfo", "TaxiNodes", "TaxiPath",
  "TaxiPathNode", "QuestV2", "QuestPOIPoint", "QuestPOIBlob",
  "BattlemasterList", "BattlemasterListXMap", "ItemSparse",
  "JournalInstanceEntrance", "JournalInstanceQueueLoc", "UiMapAssignment",
];
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const results = [];
try {
for (const name of names) {
  const signature = Buffer.from(`${name}\0`, "ascii");
  const candidates = [];
  let stringOffset = -1;
  while ((stringOffset = bytes.indexOf(signature, stringOffset + 1)) >= 0) {
    if (stringOffset > 0 && /[A-Za-z0-9_]/.test(String.fromCharCode(bytes[stringOffset - 1]))) continue;
    const va = vaAtOffset(stringOffset);
    if (va === null) continue;
    const pointer = Buffer.alloc(8);
    pointer.writeBigUInt64LE(va);
    let pointerOffset = -1;
    while ((pointerOffset = bytes.indexOf(pointer, pointerOffset + 1)) >= 0) {
      if (pointerOffset + 104 >= bytes.length) continue;
      const fileDataId = bytes.readUInt32LE(pointerOffset + 8);
      const tableHash = bytes.readUInt32LE(pointerOffset + 92);
      const layoutHash = bytes.readUInt32LE(pointerOffset + 100);
      if (fileDataId < 100_000 || fileDataId > 10_000_000
        || tableHash === 0 || layoutHash === 0) continue;
      const fileName = `FILE${fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
      const size = storage.getFileInfo(fileName)?.size;
      candidates.push({ fileDataId, tableHash: tableHash.toString(16).padStart(8, "0"),
        layoutHash: layoutHash.toString(16).padStart(8, "0"),
        registrationOffset: pointerOffset,
        localAvailable: size !== undefined && size !== 0xffff_ffff,
        localSize: size !== undefined && size !== 0xffff_ffff ? size : null });
    }
  }
  results.push({ name, candidates });
  console.log(`${name}: ${JSON.stringify(candidates)}`);
}
if (!selectedNames.length) {
  const output = join(root, "data/client-research/required-table-availability.json");
  await writeFile(output, `${JSON.stringify({ source: { product: "wow_classic_beta",
    build: storage.getProductInfo().buildNumber, installDir }, results }, null, 2)}\n`);
  console.log(`Saved source table availability to ${output}`);
}
} finally {
  storage.close();
}
