/** Read locally present WDC5 sections without fabricating encrypted rows. */
import { WDCReader } from "@rhyster/wow-casc-dbc";

export const readLocalWdc5 = (bytes) => {
  if (bytes.toString("ascii", 0, 4) !== "WDC5") {
    throw new Error("Expected a WDC5 client table.");
  }
  const recordSize = bytes.readUInt32LE(144);
  const isNormal = (bytes.readUInt16LE(172) & 1) === 0;
  const sectionCount = bytes.readUInt32LE(200);
  const omittedSections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = 204 + index * 40;
    const tactKeyHash = bytes.readBigUInt64LE(offset);
    const fileOffset = bytes.readUInt32LE(offset + 8);
    const recordCount = bytes.readUInt32LE(offset + 12);
    const stringTableSize = bytes.readUInt32LE(offset + 16);
    const offsetRecordsEnd = bytes.readUInt32LE(offset + 20);
    const idListSize = bytes.readUInt32LE(offset + 24);
    const relationshipDataSize = bytes.readUInt32LE(offset + 28);
    const offsetMapIDCount = bytes.readUInt32LE(offset + 32);
    const copyTableCount = bytes.readUInt32LE(offset + 36);
    const recordBytes = isNormal
      ? recordCount * recordSize + stringTableSize
      : offsetRecordsEnd - fileOffset;
    const size = recordBytes + idListSize + relationshipDataSize
      + offsetMapIDCount * 10 + copyTableCount * 8;
    if (fileOffset + size <= bytes.length) continue;
    if (tactKeyHash === 0n) {
      throw new Error(`Unencrypted WDC5 section ${index} is absent from the local file.`);
    }
    omittedSections.push({ index, fileOffset, size, recordCount,
      tactKeyHash: tactKeyHash.toString(16).padStart(16, "0") });
  }
  const reader = new WDCReader(bytes, omittedSections.map(({ fileOffset, size }) =>
    ({ offset: fileOffset, size })));
  return { reader, omittedSections };
};
