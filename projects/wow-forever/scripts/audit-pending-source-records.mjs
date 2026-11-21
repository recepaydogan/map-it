/** Read current client records needed to resolve the reviewed source conflicts. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const catalog = JSON.parse(await readFile("data/client-research/db2-table-names.json", "utf8"));
const storage = Storage.openEx("C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false,
});
try {
  const tables = {}, readers = new Map();
  function table(name) {
    const registration = catalog.identified.find((entry) => entry.name === name);
    if (!registration) throw new Error(`Unknown table ${name}`);
    const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    readers.set(name, reader);
    tables[name] = { fileDataId: registration.fileDataId, layoutHash: reader.layoutHash.toString(16),
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections };
    return reader;
  }
  const nodes = table("TraitNode"), links = table("TraitNodeXTraitNodeEntry");
  const entries = table("TraitNodeEntry"), definitions = table("TraitDefinition");
  const edges = table("TraitEdge");
  const arcaneWrathEdges = edges.getAllIDs().filter((id) => edges.getRowData(id).some((field) => field.data === 113627))
    .map((id) => ({ id, relationship: edges.getRowRelationship(id), row: edges.getRowData(id) }));
  const mage = nodes.getAllIDs().filter((id) => nodes.getRowRelationship(id) === 1112).map((id) => {
    const row = nodes.getRowData(id), related = links.getAllIDs().filter((linkId) => links.getRowRelationship(linkId) === id);
    return { id, row, entries: related.map((linkId) => {
      const entryId = links.getRowData(linkId)[2].data, entry = entries.getRowData(entryId);
      return { id: entryId, row: entry, definition: definitions.getRowData(entry[1].data) };
    }) };
  });
  const selectedSpells = [1326891, 1326608, 1326079, 1326080, 1326081, 1326082];
  const spellTables = {};
  for (const name of ["SpellName", "Spell", "SpellEffect"]) {
    const reader = table(name);
    spellTables[name] = reader.getAllIDs().filter((id) => name === "SpellEffect"
      ? selectedSpells.includes(reader.getRowRelationship(id)) : selectedSpells.includes(id))
      .map((id) => ({ id, relationship: reader.getRowRelationship(id), row: reader.getRowData(id) }));
  }
  const questReader = table("QuestV2");
  const quests = [79361, 93689, 92459, 92521].map((id) => ({ id, row: questReader.getRowData(id) ?? null }));
  const calculator = JSON.parse(await readFile("public/data/classes/talent-calculator.json", "utf8"));
  const classCoverage = calculator.classes.map((cls) => {
    const ids = cls.trees.flatMap((tree) => tree.talents.map((talent) => talent.id));
    const treeIds = [...new Set(ids.map((id) => nodes.getRowRelationship(id)))];
    const clientIds = nodes.getAllIDs().filter((id) => treeIds.includes(nodes.getRowRelationship(id)));
    return { name: cls.n, treeIds, currentCount: ids.length, clientCount: clientIds.length,
      missingNodeIds: clientIds.filter((id) => !ids.includes(id)),
      absentClientNodeIds: ids.filter((id) => !clientIds.includes(id)) };
  });
  const report = { source: { product: storage.getProductInfo().codeName, build: storage.getProductInfo().buildNumber },
    rule: "Readable client rows prove record identity and client talent structure. Missing encrypted rows do not prove absence; QuestV2 does not carry server quest levels or text.",
    tables, mage, arcaneWrathEdges, classCoverage, spells: spellTables, quests };
  await writeFile("data/site-research/wowhead-verified-update-2026-10-21/client-followup.json",
    `${JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
  console.log(JSON.stringify({ source: report.source, mageNodes: mage.length,
    classCoverage,
    spellRows: Object.fromEntries(Object.entries(spellTables).map(([name, rows]) => [name, rows.length])),
    quests: quests.map((quest) => ({ id: quest.id, present: Boolean(quest.row) })) },
  (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
} finally { storage.close(); }
