/** Check whether client quest, faction, and item records identify the Al'Aketh repeatable quest. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const registrations = new Map(catalog.identified.map((record) => [record.name, record]));
const names = ["Faction", "QuestFactionReward", "QuestV2", "QuestLineXQuest",
  "QuestPOIBlob", "ItemSearchName", "ItemSparse", "SpellName", "Spell", "SpellEffect"];
let factionIds = new Set();
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const simplify = (row) => Array.isArray(row) ? row.map((field, index) => ({ index,
  ...(field.data !== undefined ? { data: typeof field.data === "bigint"
    ? field.data.toString() : field.data } : {}),
  ...(field.string ? { string: field.string } : {}),
})) : [];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build) throw new Error("DB2 inventory and client build differ.");
  const tables = [];
  for (const name of names) {
    const registration = registrations.get(name);
    if (!registration) throw new Error(`Missing ${name} table registration.`);
    const bytes = storage.readFile(fileName(registration.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout changed.`);
    }
    const ids = reader.getAllIDs();
    if (name === "Faction") factionIds = new Set(ids);
    const rows = [];
    const questSecondFields = [];
    for (const id of ids) {
      const row = reader.getRowData(id);
      const fields = simplify(row);
      if (name === "QuestV2" && typeof fields[1]?.data === "number") {
        questSecondFields.push({ id, value: fields[1].data });
      }
      const strings = fields.filter(({ string }) => string).map(({ string }) => string);
      const sparseStrings = row?.type === "sparse" && Buffer.isBuffer(row.data)
        ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
          .map((match) => match[0]) : [];
      const exactFaction = name === "Faction" && id === 2749;
      const allShortRows = ["QuestFactionReward", "QuestLineXQuest", "QuestPOIBlob"]
        .includes(name);
      const alAkethName = [...strings, ...sparseStrings].some((value) =>
        /al.?aketh|more al.?aketh ears/i.test(value));
      const earName = name === "ItemSearchName" && strings.some((value) =>
        /\bear(s)?\b/i.test(value));
      const factionNumber = name === "QuestV2" && fields[1]?.data === 2749;
      const markOfAkirName = name === "SpellName" && id === 1254832;
      const markOfAkirEffect = name === "SpellEffect"
        && reader.getRowRelationship(id) === 1254832;
      const cancelMarkOfAkir = name === "SpellEffect"
        && reader.getRowRelationship(id) === 1254874
        && fields[15]?.data === 1254832;
      if (!exactFaction && !allShortRows && !alAkethName && !earName
        && !factionNumber && !markOfAkirName && !markOfAkirEffect
        && !cancelMarkOfAkir) continue;
      rows.push({ id, relationshipId: reader.getRowRelationship(id) ?? null,
        ...(allShortRows || exactFaction || factionNumber || markOfAkirName
          || markOfAkirEffect || cancelMarkOfAkir ? { fields } : {}),
        ...(alAkethName || earName ? { matchingNames: [...strings, ...sparseStrings]
          .filter((value) => /al.?aketh|\bear(s)?\b/i.test(value)).slice(0, 8) } : {}),
        ...(factionNumber ? { sameNumberAsFactionId: true } : {}),
        ...(markOfAkirName || markOfAkirEffect || cancelMarkOfAkir
          ? { markOfAkirClue: true } : {}),
      });
    }
    tables.push({ name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      readableRows: ids.length, omittedSections, selectedRows: rows,
      ...(name === "QuestV2" ? { secondFieldProfile: {
        numericRows: questSecondFields.length,
        uniqueValues: new Set(questSecondFields.map(({ value }) => value)).size,
        valuesAlsoFactionIds: questSecondFields.filter(({ value }) =>
          factionIds.has(value)).length,
        nearbyQuestIds: questSecondFields.filter(({ id }) =>
          Math.abs(id - 7142) <= 20),
      } } : {}),
    });
  }
  await writeFile(join(root, "data/client-research/al-aketh-quest-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build },
      rule: "Names and same-number matches are research clues, not schema joins. The Mark of Akir spell text mentions Al'Aketh, and SpellEffect rows can be joined to that spell by relationship ID; they do not identify a quest. A repeatable quest requires a source-backed quest ID, title, objectives, and giver position before publishing a pin.",
      tables }, null, 2)}\n`);
  console.log(tables.map(({ name, selectedRows }) =>
    `${name}: ${selectedRows.length} selected rows`).join("; "));
} finally {
  storage.close();
}
