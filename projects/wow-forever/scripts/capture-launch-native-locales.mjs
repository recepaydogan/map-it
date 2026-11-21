/** Read only the launch update's spell identities from Blizzard's current CASC build. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const directory = "data/site-research/wowhead-check-2026-11-04/localization";
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const catalog = await read("public/data/classes/talent-calculator.json");
const classes = await read("public/data/spells/foreverdb/classes.json");
const update = await read("data/site-research/wowhead-check-2026-11-04/applied-update.json");
const ids = new Set([...catalog.classes.flatMap((c) => c.trees.flatMap((t) => t.talents.flatMap((a) => a.ranks))),
  ...classes.flatMap((c) => c.abilities.flatMap((a) => a.ranks.map((r) => r.id))), ...update.newSpellIds]);
const registrations = (await read("data/client-research/db2-table-names.json")).identified;
await mkdir(directory, { recursive: true });
const strings = (row) => {
  if (Array.isArray(row)) return row.map((cell) => cell.string ?? "");
  if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return [];
  const result = []; let start = 0;
  for (let i = 0; i < 3; i++) {
    const end = row.data.indexOf(0, start);
    if (end < 0) return [];
    result.push(row.data.subarray(start, end).toString("utf8")); start = end + 1;
  }
  return result;
};
for (const locale of ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
  const file = `${directory}/native-${locale}.json`;
  const existing = await read(file).catch(() => undefined);
  if (existing?.build === 70790 && [...ids].every((id) => Object.hasOwn(existing.spells, id))) {
    console.log(`${locale}: cached ${ids.size} spell identities`); continue;
  }
  const storage = casc.Storage.openEx(path.resolve(directory, "casc-cache"), {
    codeName: "wowf", region: "eu", localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: true,
  });
  try {
    const build = storage.getProductInfo().buildNumber;
    if (build !== 70790) throw new Error(`Client build changed during update: ${build}`);
    const tables = {};
    for (const name of ["Spell", "SpellName"]) {
      const id = registrations.find((t) => t.name === name).fileDataId;
      const filename = `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
      tables[name] = readLocalWdc5(storage.readFile(filename)).reader;
    }
    const spells = Object.fromEntries([...ids].map((id) => [id, {
      name: strings(tables.SpellName.getRowData(id))[0] ?? "",
      fields: strings(tables.Spell.getRowData(id)),
    }]));
    await writeFile(file, `${JSON.stringify({ version: 1, source: "Blizzard CASC wowf EU", build, locale, spells })}\n`);
    console.log(`${locale}: captured ${ids.size} spell identities from build ${build}`);
  } finally { storage.close(); }
}
