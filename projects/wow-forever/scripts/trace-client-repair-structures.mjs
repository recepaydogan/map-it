/** Find repair and smithing artwork in placed world models from the local client. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = JSON.parse(await readFile(join(root,
  "data/client-research/adt-placement-profile.json"), "utf8"));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const terms = /repair|rugged|blacksmith|smith|forge|armou?r|weapon|anvil|workshop|mechanic|tinker/i;
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed chunk at ${offset}.`);
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4)
      .split("").reverse().join(""), offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== profile.source.build) throw new Error("Installed game build changed.");
  const records = [];
  for (const { fileDataId, placements } of profile.worldModels) {
    const bytes = storage.readFile(fileName(fileDataId));
    const chunks = chunksOf(bytes);
    const mogn = chunks.find(({ name }) => name === "MOGN");
    const mods = chunks.find(({ name }) => name === "MODS");
    const names = mogn ? [...new Set(bytes.subarray(mogn.offset, mogn.offset + mogn.size)
      .toString("latin1").split("\0").filter(Boolean))] : [];
    const sets = [];
    if (mods && mods.size % 32 === 0) {
      for (let offset = mods.offset; offset < mods.offset + mods.size; offset += 32) {
        sets.push(bytes.toString("latin1", offset, offset + 20).split("\0")[0]);
      }
    }
    const otherStrings = [...new Set(bytes.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])];
    const matchingGroups = names.filter((name) => terms.test(name));
    const matchingSets = sets.map((name, index) => ({ name, index }))
      .filter(({ name }) => terms.test(name));
    const matchingOther = otherStrings.filter((value) => terms.test(value))
      .slice(0, 30);
    if (!matchingGroups.length && !matchingSets.length && !matchingOther.length) continue;
    records.push({ kind: "world-model", fileDataId, placements, matchingGroups, matchingSets,
      matchingOther, groupCount: names.length, setCount: sets.length });
  }
  for (const { fileDataId, placements } of profile.doodadModels) {
    const bytes = storage.readFile(fileName(fileDataId));
    const matchingOther = [...new Set((bytes.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])
      .filter((value) => terms.test(value)))].slice(0, 30);
    if (!matchingOther.length) continue;
    records.push({ kind: "doodad", fileDataId, placements,
      matchingGroups: [], matchingSets: [], matchingOther });
  }
  records.sort((a, b) => b.placements - a.placements);
  const output = { source: profile.source, terms: terms.source,
    inspectedWorldModels: profile.worldModels.length,
    inspectedDoodadModels: profile.doodadModels.length, records };
  await writeFile(join(root, "data/client-research/repair-structure-clues.json"),
    `${JSON.stringify(output, null, 2)}\n`);
  const exactRepair = records.filter(({ matchingGroups, matchingSets, matchingOther }) =>
    [...matchingGroups, ...matchingSets.map(({ name }) => name), ...matchingOther]
      .some((value) => /repair|rugged/i.test(value)));
  console.log(`Inspected ${profile.worldModels.length} placed world models and ${profile.doodadModels.length} placed doodad models; ${exactRepair.length} contain a repair name.`);
} finally {
  storage.close();
}
