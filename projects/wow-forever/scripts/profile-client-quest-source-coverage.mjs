/** Measure the quest identity and objective fields available in this client. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const tutorial = await readJson("data/client-research/lazy-peons-clues.json");
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const tableNames = ["QuestV2", "QuestObjective", "QuestV2CliTask", "QuestPOIBlob",
  "QuestPOIPoint", "QuestLine", "QuestLineXQuest", "QuestHub", "QuestInfo", "QuestSort"];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || tutorial.source.build !== build) {
    throw new Error("Quest source inventory and local client belong to different builds.");
  }
  const tables = [];
  for (const name of tableNames) {
    const registration = byName.get(name);
    if (!registration) throw new Error(`Missing ${name} registration.`);
    const fileName = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const bytes = storage.readFile(fileName);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout differs from the local executable.`);
    }
    const ids = reader.getAllIDs();
    let readableStringFields = 0;
    for (const id of ids) {
      const row = reader.getRowData(id);
      if (Array.isArray(row)) readableStringFields += row.filter(({ string }) =>
        typeof string === "string" && string.trim()).length;
    }
    tables.push({ name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      readableRows: ids.length, readableStringFields, omittedSections,
      ...(name === "QuestV2" ? { tutorialQuestIds: tutorial.clues.map(({ questId }) => ({
        questId, readableRow: ids.includes(questId),
      })) } : {}),
    });
  }
  const output = join(root, "data/client-research/quest-source-coverage.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName, build },
  rule: "Counts cover locally readable WDC5 rows and decoded string fields. Omitted encrypted sections are reported separately; a missing readable row is not proof that the quest is absent from the game.",
  tables }, null, 2)}\n`);
  console.log(`Profiled ${tables.length} client quest tables; QuestV2 has ${tables[0].readableRows} readable rows and ${tables[0].readableStringFields} title strings.`);
} finally {
  storage.close();
}
