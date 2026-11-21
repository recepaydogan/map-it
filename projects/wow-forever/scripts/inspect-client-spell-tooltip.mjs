/** Compare ForeverDB spell prose with installed client text for translation review. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchLinkedSpellTemplate, spellVariableSignature } from "./lib/match-client-spell-resolved.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error("Pass one or more positive spell IDs");
}
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const registration = catalog.identified.find(({ name }) => name === "Spell");
if (!registration) throw new Error("Missing installed client Spell table registration");
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const locales = ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const details = new Map();
for (const id of ids) {
  const shard = JSON.parse(await readFile(join(root, `public/data/spells/foreverdb/${id % 64}.json`), "utf8"));
  details.set(id, shard[id]);
}

for (const locale of locales) {
  const storage = casc.Storage.openEx(installDir, {
    codeName: "wow_classic_beta", region: "us",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    for (const id of ids) {
      const row = reader.getRowData(id);
      if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) continue;
      let start = 0;
      const values = [];
      for (let field = 0; field < 3; field += 1) {
        const end = row.data.indexOf(0, start);
        if (end < 0) break;
        values.push(row.data.subarray(start, end).toString("utf8"));
        start = end + 1;
      }
      console.log(JSON.stringify({ locale, id, rank: values[0], description: values[1], aura: values[2],
        ...(locale === "enUS" ? {
          signature: spellVariableSignature(values[1]),
          resolvedMatch: matchLinkedSpellTemplate(values[1], details.get(id)?.d ?? ""),
        } : {}) }));
    }
  } finally {
    storage.close();
  }
}

for (const id of ids) {
  const detail = details.get(id);
  console.log(JSON.stringify({ source: "ForeverDB", id, rank: detail?.r, description: detail?.d, aura: detail?.a }));
}
