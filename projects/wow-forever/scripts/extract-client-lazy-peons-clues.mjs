/** Preserve the two locally annotated Lazy Peons quest IDs without choosing one. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const questTable = catalog.identified.find(({ name }) => name === "QuestV2");
const effectTable = catalog.identified.find(({ name }) => name === "SpellEffect");
const spellNameTable = catalog.identified.find(({ name }) => name === "SpellName");
const creatureTable = catalog.identified.find(({ name }) => name === "Creature");
if (!questTable || !effectTable || !spellNameTable || !creatureTable) {
  throw new Error("A Lazy Peons client table is not locally available.");
}
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const scriptFileDataId = 4763226;
  const scriptBytes = storage.readFile(fileName(scriptFileDataId));
  const script = scriptBytes.toString("utf8");
  const patterns = [
    { role: "item-use tutorial", section: "UseQuestItem",
      expression: /QuestID\s*=\s*(\d+),\s*-- Lazy Peons\b/ },
    { role: "pickup tutorial", section: "MultiQuestPickup",
      expression: /(\d+),\s*-- Lazy Peons\b/ },
  ];
  const questBytes = storage.readFile(fileName(questTable.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(questBytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== questTable.layoutHash) {
    throw new Error("QuestV2 layout changed since the local table inventory.");
  }
  const readableQuestIds = new Set(reader.getAllIDs());
  const findAnnotatedBlock = (section, expression) => {
    const blocks = script.matchAll(new RegExp(
      `${section}\\s*=\\s*\\{([\\s\\S]*?)\\r?\\n\\s*\\};`, "g"));
    const matches = [...blocks].filter((block) => expression.test(block[1]));
    if (matches.length !== 1) {
      throw new Error(`Expected one Lazy Peons ${section} block; found ${matches.length}.`);
    }
    const block = matches[0];
    const sectionNames = [...script.slice(0, block.index)
      .matchAll(/TutorialData\.([A-Za-z]+)\s*=\s*\{/g)];
    const tutorialRace = sectionNames.at(-1)?.[1];
    if (!tutorialRace) throw new Error(`Missing race context for ${section}.`);
    return { text: block[1], tutorialRace };
  };
  const clues = patterns.map(({ role, section, expression }) => {
    const block = findAnnotatedBlock(section, expression);
    const match = expression.exec(block.text);
    if (!match) throw new Error(`Missing Lazy Peons ${role} clue in local tutorial script.`);
    const questId = Number(match[1]);
    return { role, tutorialRace: block.tutorialRace, questId,
      locallyReadableQuestV2Row: readableQuestIds.has(questId) };
  });
  if (new Set(clues.map(({ tutorialRace }) => tutorialRace)).size !== 1) {
    throw new Error("Lazy Peons tutorial clues belong to different race sections.");
  }
  const itemUseBlock = findAnnotatedBlock("UseQuestItem", patterns[0].expression);
  const useContext = /QuestID\s*=\s*(\d+),\s*-- Lazy Peons\s*UnitID\s*=\s*(\d+),\s*SpellID\s*=\s*(\d+)/.exec(itemUseBlock.text);
  if (!useContext || Number(useContext[1]) !== clues[0].questId) {
    throw new Error("The Lazy Peons item-use relationship changed in the tutorial script.");
  }
  const unitId = Number(useContext[2]);
  const spellId = Number(useContext[3]);
  const effectBytes = storage.readFile(fileName(effectTable.fileDataId));
  const { reader: effects, omittedSections: effectOmittedSections } = readLocalWdc5(effectBytes);
  if (effects.layoutHash.toString(16).padStart(8, "0") !== effectTable.layoutHash) {
    throw new Error("SpellEffect layout changed since the local table inventory.");
  }
  const spellEffectIds = effects.getAllIDs().filter((id) =>
    effects.getRowRelationship(id) === spellId);
  const spellNameBytes = storage.readFile(fileName(spellNameTable.fileDataId));
  const { reader: spellNames, omittedSections: spellNameOmittedSections } =
    readLocalWdc5(spellNameBytes);
  if (spellNames.layoutHash.toString(16).padStart(8, "0") !== spellNameTable.layoutHash) {
    throw new Error("SpellName layout changed since the local table inventory.");
  }
  const spellNameRow = spellNames.getAllIDs().includes(spellId)
    ? spellNames.getRowData(spellId) : null;
  const spellName = Array.isArray(spellNameRow)
    ? spellNameRow.find(({ string }) => typeof string === "string" && string.trim())?.string
    : undefined;
  const creatureBytes = storage.readFile(fileName(creatureTable.fileDataId));
  const { reader: creatures, omittedSections: creatureOmittedSections } =
    readLocalWdc5(creatureBytes);
  if (creatures.layoutHash.toString(16).padStart(8, "0") !== creatureTable.layoutHash) {
    throw new Error("Creature layout changed since the local table inventory.");
  }
  const locallyReadableCreatureRow = creatures.getAllIDs().includes(unitId);
  const output = join(root, "data/client-research/lazy-peons-clues.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    scriptFileDataId,
    scriptSha256: createHash("sha256").update(scriptBytes).digest("hex"),
    questV2FileDataId: questTable.fileDataId,
    questV2Sha256: createHash("sha256").update(questBytes).digest("hex"),
    questV2OmittedSections: omittedSections,
    spellEffectFileDataId: effectTable.fileDataId,
    spellEffectSha256: createHash("sha256").update(effectBytes).digest("hex"),
    spellEffectOmittedSections: effectOmittedSections,
    spellNameFileDataId: spellNameTable.fileDataId,
    spellNameSha256: createHash("sha256").update(spellNameBytes).digest("hex"),
    spellNameOmittedSections,
    creatureFileDataId: creatureTable.fileDataId,
    creatureSha256: createHash("sha256").update(creatureBytes).digest("hex"),
    creatureOmittedSections,
  }, seedName: "Lazy Peons", clues,
  relatedLocalIds: { unitId, spellId, spellEffectIds,
    spellName: spellName ?? null, locallyReadableCreatureRow },
  conclusion: `The local ${clues[0].tutorialRace} tutorial uses the Lazy Peons label for quest IDs ${clues.map(({ questId }) => questId).join(" and ")} in different examples. Neither has a locally readable QuestV2 row, and no quest-giver position is verified.` }, null, 2)}\n`);
  console.log(`Preserved ${clues.length} distinct Lazy Peons quest clues.`);
} finally {
  storage.close();
}
