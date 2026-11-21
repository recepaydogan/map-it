import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

// Equipment is a separate native input, not a treasure table or ItemList.
// Preserve groups and repeated entries; neither alternatives nor two weapons
// may be collapsed into an unconditional, single-item loot claim.
export const readNativeEquipment = (sources, projectRoot) => {
  const definitions = new Map(), hashes = {};
  for (const filename of sources) {
    const sourcePath = path.relative(projectRoot, filename).split(path.sep).join("/");
    if (Object.hasOwn(hashes, sourcePath)) throw new Error(`Repeated equipment source: ${sourcePath}`);
    const bytes = fs.readFileSync(filename);
    hashes[sourcePath] = createHash("sha256").update(bytes).digest("hex");
    let current, group;
    for (const [index, rawLine] of bytes.toString("utf8").split(/\r?\n/).entries()) {
      const line = rawLine.trim(), sourceLine = index + 1;
      if (!line || line.startsWith("//")) continue;
      const header = line.match(/^new equipment "([^"]+)"$/);
      if (header) {
        if (definitions.has(header[1])) throw new Error(`Duplicate equipment definition: ${header[1]} at ${sourcePath}:${sourceLine}`);
        current = { id: header[1], sourcePath, sourceLine, groups: [] };
        definitions.set(current.id, current);
        group = undefined;
        continue;
      }
      const weaponSet = line.match(/^add initialweaponset "([^"]+)"$/);
      if (current && weaponSet) {
        if (current.initialWeaponSet) throw new Error(`Repeated initial weapon set at ${sourcePath}:${sourceLine}`);
        current.initialWeaponSet = weaponSet[1];
        continue;
      }
      if (current && line === "add equipmentgroup") {
        group = { sourceLine, entries: [] };
        current.groups.push(group);
        continue;
      }
      const entry = line.match(/^add equipment entry "([^"]+)"$/);
      if (group && entry) {
        group.entries.push({ statsId: entry[1], sourceLine });
        continue;
      }
      throw new Error(`Unsupported equipment source at ${sourcePath}:${sourceLine}: ${line}`);
    }
  }
  for (const definition of definitions.values()) {
    if (definition.groups.some(({ entries }) => entries.length === 0)) throw new Error(`Empty equipment group: ${definition.id}`);
  }
  return { definitions, hashes };
};

export const readVerifiedEquipmentCatalog = (filename, projectRoot) => {
  const catalog = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!catalog.sourceHashes || !Object.keys(catalog.sourceHashes).length || !catalog.definitions) {
    throw new Error(`Equipment catalog lacks native evidence: ${filename}`);
  }
  const native = readNativeEquipment(Object.keys(catalog.sourceHashes).map((file) => path.resolve(projectRoot, file)), projectRoot);
  if (!isDeepStrictEqual(native.hashes, catalog.sourceHashes)
    || !isDeepStrictEqual(Object.fromEntries(native.definitions), catalog.definitions)) {
    throw new Error(`Equipment catalog differs from native definitions: ${filename}`);
  }
  return catalog;
};

export const equipmentStatReferences = (catalog) => Object.values(catalog?.definitions ?? {}).flatMap((definition) =>
  definition.groups.flatMap((group) => group.entries.map((entry) => ({ statsId: entry.statsId,
    sourcePath: definition.sourcePath, sourceLine: entry.sourceLine }))));
