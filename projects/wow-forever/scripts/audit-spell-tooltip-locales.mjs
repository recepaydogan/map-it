/** Count spell detail fields that still fall back to English in each client locale. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const regionalSpanish = await read("data/spell-tooltip-localization/reviewed-spanish-regional-auras.json");
const index = await read("public/data/spells/foreverdb/index.json");
const playerSpellIds = new Set(index.filter((row) => row[4]).map((row) => String(row[0])));
const details = new Map();
for (let shard = 0; shard < 64; shard += 1) {
  const records = await read(`public/data/spells/foreverdb/${shard}.json`);
  for (const [id, record] of Object.entries(records)) details.set(id, record);
}

for (const locale of locales) {
  const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
  if (pack.version !== 1 || pack.locale !== locale || !pack.entries ||
    Object.entries(pack.entries).some(([id, entry]) => !details.has(id) ||
      Object.entries(entry).some(([field, value]) => !["r", "d", "a", "old"].includes(field) ||
        typeof value !== "string" || !value.trim() || /\$[A-Za-z0-9{]/.test(value)))) {
    throw new Error(`${locale}: invalid spell tooltip locale pack`);
  }
  const missing = { r: 0, d: 0, a: 0, old: 0 };
  let playerDescriptions = 0;
  const samples = [];
  for (const [id, detail] of details) {
    for (const field of Object.keys(missing)) {
      if (!detail[field] || (field === "old" && detail.old === detail.d) ||
        pack.entries[id]?.[field]) continue;
      missing[field] += 1;
      if (field === "d" && playerSpellIds.has(id)) playerDescriptions += 1;
      if (field === "d" && samples.length < 3) samples.push(`${id} ${detail.n}: ${detail.d}`);
    }
  }
  console.log(`${locale}: English fallback: ${missing.d} descriptions (${playerDescriptions} player spells), ` +
    `${missing.a} auras, ${missing.r} ranks, ${missing.old} Classic Era descriptions` +
    (locale === "esMX" ? `; ${regionalSpanish.fields.filter((row) =>
      pack.entries[row.id]?.[row.field] === row.esES).length} regional Spanish aura fallbacks` : ""));
  if (process.argv.includes("--samples")) for (const sample of samples) console.log(`  ${sample.slice(0, 180)}`);
  if (process.argv.includes("--fail") && Object.values(missing).some(Boolean)) process.exitCode = 1;
}
