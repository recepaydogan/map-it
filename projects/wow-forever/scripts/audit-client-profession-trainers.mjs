/** Audit profession and trainer evidence in the installed game client. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const textIndex = await readJson("data/client-research/local-text-index.json");
const publishedSigns = await readJson("data/client-research/published-zephras-sign-evidence.json");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ranks = ["Apprentice", "Journeyman", "Expert", "Artisan", "Master", "Grand Master"];
const requestedPhrases = ["Mining Trainer", "First Aid Trainer", "Journeyman Enchanter",
  "Journeyman Leatherworker", "Expert Blacksmith", "Fishing Trainer"];
const professionAliases = {
  "First Aid": ["first aid", "medic"],
  Blacksmithing: ["blacksmithing", "blacksmith", "smithing"],
  Leatherworking: ["leatherworking", "leatherworker"],
  Alchemy: ["alchemy", "alchemist"],
  Herbalism: ["herbalism", "herbalist"],
  Cooking: ["cooking", "cook"],
  Mining: ["mining", "miner"],
  Tailoring: ["tailoring", "tailor"],
  Engineering: ["engineering", "engineer"],
  Enchanting: ["enchanting", "enchanter"],
  Fishing: ["fishing", "fisherman", "fisher"],
  Skinning: ["skinning", "skinner"],
};
const normalize = (value) => value.toLowerCase().trim().replace(/\s+/g, " ");
const professionByAlias = new Map(Object.entries(professionAliases)
  .flatMap(([profession, aliases]) => aliases.map((alias) => [alias, profession])));
const parseTitle = (value) => {
  const normalized = normalize(value);
  const rank = ranks.find((candidate) => normalized.startsWith(`${normalize(candidate)} `));
  const body = rank ? normalized.slice(rank.length + 1) : normalized;
  const isTrainer = body.endsWith(" trainer");
  const profession = professionByAlias.get(isTrainer ? body.slice(0, -8) : body);
  if (!profession || (!rank && !isTrainer)) return null;
  return { profession, rank: rank ?? null, isTrainer };
};
const sourceTables = new Set(["Profession", "SkillLine", "SpellName", "Achievement", "Creature",
  "CreatureDifficulty", "GossipNPCOption", "CollectableSourceVendor",
  "CollectableSourceVendorSparse", "GameObjects", "AreaPOI"]);
const npcTables = new Set(["Creature", "CreatureDifficulty", "GossipNPCOption",
  "CollectableSourceVendor", "CollectableSourceVendorSparse"]);
const textFlags = new Set(textIndex.textFlags);
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });

try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build || build !== textIndex.source.build
    || build !== publishedSigns.source.build) {
    throw new Error("The game installation, table catalog, and text inventory belong to different builds.");
  }
  const tableSources = [];
  const professionRows = [];
  const skillNames = new Map();
  const spellNames = [];
  const achievementTitles = [];
  const titleCandidates = [];
  const requestedPhraseHits = Object.fromEntries(requestedPhrases.map((phrase) => [phrase, []]));
  let decodedRows = 0;
  let encryptedRowsOmitted = 0;
  for (const table of catalog.identified) {
    const bytes = storage.readFile(fileName(table.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
      throw new Error(`Local ${table.name} layout changed.`);
    }
    const ids = reader.getAllIDs();
    const omitted = omittedSections.reduce((sum, section) => sum + section.recordCount, 0);
    decodedRows += ids.length;
    encryptedRowsOmitted += omitted;
    if (sourceTables.has(table.name)) {
      tableSources.push({ name: table.name, fileDataId: table.fileDataId,
        sha256: sha256(bytes), decodedRows: ids.length, encryptedRows: omitted });
    }
    for (const id of ids) {
      const row = reader.getRowData(id);
      if (table.name === "Profession" && Array.isArray(row)) {
        professionRows.push({ professionId: id, skillLineId: Number(row[1]?.data) });
      }
      if (table.name === "SkillLine" && Array.isArray(row)) {
        skillNames.set(id, row[0]?.string ?? null);
      }
      if (table.name === "Achievement" && Array.isArray(row) && row[1]?.string) {
        const parsed = parseTitle(row[1].string);
        if (parsed?.rank) achievementTitles.push({ achievementId: id,
          title: row[1].string, description: row[0]?.string ?? null,
          profession: parsed.profession, rank: parsed.rank });
      }
      const strings = Array.isArray(row)
        ? row.flatMap((field, fieldIndex) => typeof field?.string === "string" && field.string.trim()
          ? [{ fieldIndex, value: field.string }] : [])
        : row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
            .map((match) => ({ sparseByteOffset: match.index, value: match[0] })) : [];
      for (const match of strings) {
        const value = normalize(match.value);
        for (const phrase of requestedPhrases) {
          if (value !== normalize(phrase)) continue;
          requestedPhraseHits[phrase].push({ table: table.name, fileDataId: table.fileDataId,
            rowId: id, ...match });
        }
        if (table.name === "SpellName") spellNames.push({ spellId: id, name: match.value });
        if (match.value.length > 100) continue;
        const parsed = parseTitle(value);
        if (!parsed) continue;
        titleCandidates.push({ table: table.name, fileDataId: table.fileDataId,
          rowId: id, ...match, profession: parsed.profession,
          rank: parsed.rank, isTrainer: parsed.isTrainer,
          kind: npcTables.has(table.name) ? "npc-table-string"
            : table.name === "GameObjects" ? "placed-object-name"
              : table.name === "SpellName" ? "spell-name" : "other-string" });
      }
    }
  }
  const professions = professionRows.sort((a, b) => a.professionId - b.professionId)
    .map((row) => ({ ...row, name: skillNames.get(row.skillLineId) ?? null }));
  if (professions.length !== 12 || professions.some(({ name }) => !professionAliases[name])) {
    throw new Error("The local profession taxonomy changed; review it before classifying trainers.");
  }
  const rankSpells = professions.map(({ professionId, skillLineId, name }) => ({
    professionId, skillLineId, name,
    spells: spellNames.filter(({ name: spellName }) => {
      const parsed = parseTitle(spellName);
      return parsed?.profession === name && parsed.rank && !parsed.isTrainer;
    }).map(({ spellId, name: spellName }) => ({ spellId, name: spellName,
      rank: parseTitle(spellName).rank })),
  }));
  const rankTitles = professions.map(({ professionId, skillLineId, name }) => ({
    professionId, skillLineId, name,
    ranks: ranks.map((rank) => ({ rank,
      spells: rankSpells.find((entry) => entry.professionId === professionId).spells
        .filter((spell) => spell.rank === rank),
      achievements: achievementTitles.filter((entry) =>
        entry.profession === name && entry.rank === rank),
    })).filter(({ spells, achievements }) => spells.length || achievements.length),
  }));
  const textFiles = [];
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      if (entry.available && textFlags.has(entry.contentFlags) && entry.fileSize <= 2_000_000) {
        textFiles.push({ fileDataId: entry.fileDataId, fileName: entry.fileName });
      }
    }
  } finally { storage.findClose(); }
  if (textFiles.length !== textIndex.candidateFiles) {
    throw new Error("The local text-file inventory changed.");
  }
  const textPhraseHits = Object.fromEntries(requestedPhrases.map((phrase) => [phrase, []]));
  let readableTextFiles = 0;
  for (const file of textFiles) {
    let bytes;
    try {
      bytes = storage.readFile(file.fileName);
    } catch (error) {
      if (error?.codeName === "ERROR_FILE_ENCRYPTED") continue;
      throw error;
    }
    readableTextFiles += 1;
    const value = bytes.toString("utf8");
    for (const phrase of requestedPhrases) {
      if (new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, "iu").test(value)) {
        textPhraseHits[phrase].push(file.fileDataId);
      }
    }
  }
  const npcTitleCandidates = titleCandidates.filter(({ kind }) => kind === "npc-table-string");
  const placedObjectNames = titleCandidates.filter(({ kind }) => kind === "placed-object-name");
  const objectSource = tableSources.find(({ name }) => name === "GameObjects");
  const signObjectSource = publishedSigns.source.tables.find(({ name }) => name === "GameObjects");
  if (!objectSource || objectSource.sha256 !== signObjectSource?.sha256) {
    throw new Error("The published sign evidence belongs to another GameObjects file.");
  }
  const placedSignEvidence = placedObjectNames.map(({ rowId, value }) => {
    const sign = publishedSigns.markers.find(({ objectId, name }) =>
      objectId === rowId && name === value);
    if (!sign) throw new Error(`Placed trainer-named object ${rowId} lacks sign evidence.`);
    return { ...sign, classification: "placed-wayfinding-sign-not-an-npc" };
  });
  const report = {
    source: { product: storage.getProductInfo().codeName, build,
      db2TableCount: catalog.identified.length, textFlags: [...textFlags] },
    coverage: { decodedRows, encryptedRowsOmitted, textFilesScanned: readableTextFiles,
      registeredNpcSpawnTables: catalog.identified.filter(({ name }) =>
        /(?:creature|npc).*spawn|spawn.*(?:creature|npc)/i.test(name))
        .map(({ name, fileDataId }) => ({ name, fileDataId })) },
    classification: "Profession IDs and names join through Profession.skillLineId to SkillLine. Rank spells are spell names, and placed GameObjects are scenery. Neither establishes a trainer NPC or its coordinates.",
    tableSources, professions, rankTitles, requestedPhraseHits, textPhraseHits,
    titleCandidates, npcTitleCandidates, placedObjectNames, placedSignEvidence,
    verifiedTrainerNpcs: [],
  };
  await writeFile(join(root, "data/client-research/profession-trainer-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Scanned ${decodedRows} decoded DB2 rows in ${catalog.identified.length} tables and ${readableTextFiles} text resources.`);
  console.log(`${professions.length} professions, ${rankSpells.reduce((sum, entry) => sum + entry.spells.length, 0)} rank spell names, ${achievementTitles.length} achievement titles, ${titleCandidates.length} title candidates, ${npcTitleCandidates.length} NPC-table candidates, ${placedObjectNames.length} placed-object names.`);
  for (const [phrase, hits] of Object.entries(requestedPhraseHits)) {
    console.log(`${phrase}: ${hits.length} DB2 exact hits, ${textPhraseHits[phrase].length} text-resource hits`);
  }
} finally {
  storage.close();
}
