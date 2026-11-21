/** Inventory named service/transport objects without equating them with NPCs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const record = catalog.identified.find(({ name }) => name === "GameObjects");
if (!record) throw new Error("Missing client GameObjects registration.");
const terms = ["bank", "auction", "inn", "goods", "supplies", "shop", "trainer",
  "barber", "stable", "repair", "mailbox", "vault", "boat", "port", "dock", "flight",
  "smith", "armor", "armory", "arms", "weapon", "forge", "anvil", "merchant", "vendor"];
const termsByName = new Map();
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The atlas and local client differ in build.");
  }
  const fileName = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  const project = createClientWorldProjector(atlas);
  const records = [];
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || !row[0]?.string) continue;
    const name = row[0].string;
    const matchingTerms = terms.filter((term) =>
      new RegExp(term === "anvil" ? "(^|[^a-z])anvil($|[^a-z])"
        : `(^|[^a-z])${term}`, "i").test(name));
    if (!matchingTerms.length) continue;
    const bytes = Buffer.alloc(12);
    for (let index = 0; index < 3; index += 1) {
      bytes.writeUInt32LE(Number((row[1].data >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
    }
    const worldPosition = [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
    const mapId = row[4].data;
    records.push({ objectId: id, name, terms: matchingTerms, mapId,
      worldPosition, atlasPosition: project(mapId, worldPosition),
      displayId: row[5].data });
    termsByName.set(name, (termsByName.get(name) ?? 0) + 1);
  }
  await writeFile(join(root, "data/client-research/service-object-candidates.json"),
    `${JSON.stringify({ source: {
      product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      table: "GameObjects", fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections,
    }, terms, caveat: "A named placed game object may be a sign, building, or decoration. It does not prove a nearby NPC, merchant inventory, or active transport route.",
    distinctNames: [...termsByName].map(([name, occurrences]) => ({ name, occurrences })),
    records }, null, 2)}\n`);
  console.log(`Found ${records.length} possible service/transport objects with ${termsByName.size} distinct names.`);
} finally {
  storage.close();
}
