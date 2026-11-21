/** Read installed-client item names missing from the extracted English source. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { decodeClientItemSparse } from "./lib/decode-client-item-sparse.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("public/data/items/catalog.json");
const source = await read("public/data/locales/wow-forever/source.json");
const sourceKeys = new Set(source.keys);
const targets = catalog.items.filter((item) =>
  !sourceKeys.has(`ItemSparse:${item.id}:4`));
const tables = await read("data/client-research/db2-table-names.json");
const registration = tables.identified.find((entry) => entry.name === "ItemSparse");
if (!registration) throw new Error("Missing ItemSparse registration");
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const locales = ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const names = new Map(targets.map((item) => [Number(item.id),
  { id: Number(item.id), catalogName: item.name, client: {} }]));
let build;
for (const locale of locales) {
  const storage = casc.Storage.openEx(installDir, {
    codeName: "wow_classic_beta", region: "us",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    build ??= storage.getProductInfo().buildNumber;
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    for (const record of names.values()) {
      const row = reader.getRowData(record.id);
      if (row?.type !== "sparse") continue;
      const name = decodeClientItemSparse(row.data).name;
      if (name?.trim()) record.client[locale] = name;
    }
  } finally {
    storage.close();
  }
}
const candidates = [...names.values()].filter((record) =>
  Object.keys(record.client).length);
const localized = candidates.reduce((count, record) => count +
  locales.slice(1).filter((locale) => record.client[locale] &&
    record.client[locale] !== (record.client.enUS ?? record.catalogName)).length, 0);
const output = { version: 1, product: "wow_classic_beta", build,
  checkedIds: targets.length, clientIds: candidates.length,
  localizedFields: localized, candidates };
await writeFile(join(root, "data/site-research/client-item-name-fallbacks.json"),
  `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ build, checkedIds: targets.length,
  clientIds: candidates.length, localizedFields: localized }));
