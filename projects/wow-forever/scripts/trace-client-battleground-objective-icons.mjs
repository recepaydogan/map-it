/** Look for native artwork explicitly named for battleground map objectives. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const registration = catalog.identified.find(({ name }) => name === "UiTextureAtlasMember");
if (!registration) throw new Error("UiTextureAtlasMember is not registered in the local client.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== catalog.source.build) {
    throw new Error("The atlas registration belongs to another client build.");
  }
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("UiTextureAtlasMember layout changed in the local client.");
  }
  const pattern = /capture|contested|flag|battleground|arathi|alterac|mine|blacksmith|stable|farm|objective|worldstate/i;
  const candidates = reader.getAllIDs().flatMap((id) => {
    const row = reader.getRowData(id);
    const name = row?.[0]?.string;
    return typeof name === "string" && pattern.test(name)
      ? [{ memberId: id, name, atlasId: row[2]?.data ?? null,
        size: [row[3]?.data ?? null, row[4]?.data ?? null] }] : [];
  });
  await writeFile(join(root, "data/client-research/battleground-objective-icon-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: catalog.source.build, table: registration.name,
      fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections },
    rule: "Name-matched atlas members are artwork candidates only. A source join to AreaPOI icon 132 is needed before assigning one to battleground objective pins.",
    candidates }, null, 2)}\n`);
  console.log(`Found ${candidates.length} named battleground/objective artwork candidates.`);
} finally {
  storage.close();
}
