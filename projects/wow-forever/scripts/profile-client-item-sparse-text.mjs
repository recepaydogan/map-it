/** Inspect readable ItemSparse string tails without assigning field meanings. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidates = JSON.parse(await readFile(join(root, "data/client-research/item-catalog-candidates.json"), "utf8"));
const tables = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const registration = tables.identified.find((entry) => entry.name === "ItemSparse");
if (!registration) throw new Error("Missing ItemSparse registration");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (candidates.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Candidate items and local ItemSparse belong to different builds");
  }
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("ItemSparse layout changed");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const records = candidates.records.flatMap(({ itemId, name, sparseNameOffset }) => {
    const row = reader.getRowData(itemId);
    if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return [];
    const tail = row.data.subarray(sparseNameOffset);
    const strings = [];
    let start = 0;
    for (let at = 0; at <= tail.length; at++) {
      if (at < tail.length && tail[at] !== 0) continue;
      const slice = tail.subarray(start, at);
      if (slice.length >= 4 && slice.length <= 500) {
        try {
          const value = decoder.decode(slice);
          if (/^[^\p{C}]+$/u.test(value)) strings.push({ offset: sparseNameOffset + start, value });
        } catch { /* Binary segments are not UTF-8 strings. */ }
      }
      start = at + 1;
    }
    return [{ itemId, name, strings: strings.filter(({ value }) => value !== name) }];
  });
  const withExtraText = records.filter((record) => record.strings.length > 0);
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber, table: { name: "ItemSparse",
      fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } },
  recordCount: records.length, withExtraTextCount: withExtraText.length,
  rule: "NUL-delimited valid UTF-8 runs after the exact name are text candidates only. Their field meaning is not established; do not publish them without corroboration.",
  records: withExtraText };
  await writeFile(join(root, "data/client-research/item-sparse-text-candidates.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${records.length} items inspected; ${withExtraText.length} have extra readable text runs`);
  for (const name of ["Worn Shortsword", "Thunderfury, Blessed Blade of the Windseeker", "Beastmaster's Boots"]) {
    const record = records.find((entry) => entry.name === name);
    console.log(name, JSON.stringify(record?.strings.slice(0, 4) ?? []));
  }
} finally {
  storage.close();
}
