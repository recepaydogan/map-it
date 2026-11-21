/** Follow native item/quest joins and retry encrypted files with local client keys. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { decodeClientItemSparse } from "./lib/decode-client-item-sparse.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const auditPath = join(root, "data/client-research/quest-marker-seed-audit.json");
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const indexed = new Map(audit.tables.map((table) => [table.name, table]));
const storage = Storage.openEx(audit.source.installDir, { codeName: "wow_classic_beta",
  localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const product = storage.getProductInfo();
  const executable = await readFile(audit.source.executablePath);
  if (product.buildNumber !== audit.source.buildNumber
    || hash(executable) !== audit.source.executableSha256) {
    throw new Error("The game changed since the archive audit.");
  }
  const loaded = new Map();
  const readTable = (name) => {
    if (loaded.has(name)) return loaded.get(name);
    const table = indexed.get(name);
    if (!table) throw new Error(`Missing current native registration: ${name}.`);
    const bytes = storage.readFile(`FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    if (hash(bytes) !== table.sha256) throw new Error(`Native ${name} changed since the audit.`);
    const decoded = { ...table, ...readLocalWdc5(bytes) };
    loaded.set(name, decoded);
    return decoded;
  };
  const items = readTable("ItemSparse");
  if (items.layoutHash !== "6fcc3191") throw new Error("The native item decoder does not support this layout.");
  const quests = readTable("QuestV2");
  const blobs = readTable("QuestPOIBlob");
  if (blobs.layoutHash !== "fdc814cf") throw new Error("The native POI decoder does not support this layout.");
  const itemLinks = readTable("ItemXItemEffect");
  const effects = readTable("ItemEffect");
  const spellNames = readTable("SpellName");
  if (itemLinks.layoutHash !== "96f083ad" || effects.layoutHash !== "4ca77678"
    || spellNames.layoutHash !== "782ee721") throw new Error("An item/spell join layout changed.");
  const itemEvidence = [];
  for (const match of audit.rowMatches.filter((entry) => entry.table === "ItemSparse")) {
    const row = items.reader.getRowData(match.id);
    if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) throw new Error("Expected a sparse item record.");
    const item = decodeClientItemSparse(row.data);
    const poiBlobs = item.startQuestId ? blobs.reader.getAllIDs().filter((id) =>
      blobs.reader.getRowData(id)?.[5]?.data === item.startQuestId) : [];
    const spells = itemLinks.reader.getAllIDs().flatMap((id) => {
      if (itemLinks.reader.getRowRelationship(id) !== match.id) return [];
      const effectId = itemLinks.reader.getRowData(id)?.[0]?.data;
      const effect = effects.reader.getRowData(effectId);
      if (!Array.isArray(effect)) return [{ linkId: id, effectId, unresolved: true }];
      const spellId = effect[6]?.data;
      return [{ linkId: id, effectId, triggerCode: effect[1]?.data,
        spellId, spellName: spellNames.reader.getRowData(spellId)?.[0]?.string ?? null }];
    });
    itemEvidence.push({ itemId: match.id, name: item.name, description: item.description,
      startQuestId: item.startQuestId, pageId: item.pageId, requiredLevel: item.requiredLevel,
      allowableClass: item.allowableClass,
      registeredStartQuest: item.startQuestId ? quests.reader.getAllIDs().includes(item.startQuestId) : false,
      startQuestPoiBlobIds: poiBlobs, spells });
  }

  // Shipped native key tables are the only extra source used for this retry.
  // Key bytes are never written to the research report or sent to the network.
  const keys = readTable("TactKey");
  const lookups = readTable("TactKeyLookup");
  const nativeKeyRows = [];
  const nativeKeyNames = new Set();
  for (const id of keys.reader.getAllIDs()) {
    const key = keys.reader.getRowData(id)?.[0]?.data;
    const name = lookups.reader.getRowData(id)?.[0]?.data;
    if (typeof key !== "bigint" || typeof name !== "bigint" || key === 0n || name === 0n) continue;
    const keyName = name.toString(16).padStart(16, "0");
    const keyBytes = Buffer.from(key.toString(16).padStart(32, "0"), "hex").reverse();
    nativeKeyNames.add(keyName);
    nativeKeyRows.push(`${keyName} ${keyBytes.toString("hex")}`);
  }
  const imported = nativeKeyRows.length > 0 && storage.importKeysFromString(nativeKeyRows.join("\n"));
  const retried = [];
  const recoveredMatches = [];
  const expression = new RegExp(audit.terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  for (const entry of audit.archive.errors.filter((entry) => entry.code === "ERROR_FILE_ENCRYPTED")) {
    try {
      const bytes = storage.readFile(`FILE${entry.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
      retried.push({ fileDataId: entry.fileDataId, readable: true, bytes: bytes.length,
        magic: bytes.subarray(0, 4).toString("latin1"), sha256: hash(bytes) });
      expression.lastIndex = 0;
      const text = bytes.toString("utf8");
      const found = [...text.matchAll(expression)].slice(0, 8).map((match) => ({ term: match[0],
        excerpt: text.slice(Math.max(0, match.index - 65), match.index + match[0].length + 90)
          .replace(/[^\x20-\x7e]/g, " ").trim() }));
      if (found.length) recoveredMatches.push({ fileDataId: entry.fileDataId, contexts: found });
    } catch (error) { retried.push({ fileDataId: entry.fileDataId, readable: false, code: error.codeName ?? error.message }); }
  }
  const omittedKeyHashes = [...new Set(audit.relevantTables.flatMap((table) =>
    table.omittedSections?.map((section) => section.tactKeyHash) ?? []))];
  const report = { source: { ...audit.source, tracedAt: new Date().toISOString(), archiveAuditSha256: hash(await readFile(auditPath)) },
    rule: "The matched ItemSparse rows are decoded with their validated current layout and followed through native start-quest/POI/item-effect/spell-name joins. The client's shipped TactKey/TactKeyLookup entries are tried locally; no online keys or community data are used. Item/page/spell identities alone do not identify quest giver coordinates.",
    itemEvidence,
    executableStrings: ["RequestLoadQuestByID", "QUEST_DATA_LOAD_RESULT", "questcache.wdb",
      "creaturecache.wdb", "pagetextcache.wdb"].map((text) => ({ text,
        present: executable.includes(Buffer.from(text)) })),
    nativeKeys: { keyRows: keys.reader.getAllIDs().length, lookupRows: lookups.reader.getAllIDs().length,
      usablePairs: nativeKeyRows.length, importAccepted: imported,
      omittedSectionKeysAvailableLocally: omittedKeyHashes.filter((name) => nativeKeyNames.has(name)).length },
    encryptedRetry: { attempted: retried.length, recoveredFiles: retried.filter((entry) => entry.readable).length,
      remaining: retried.filter((entry) => !entry.readable).length, recoveredMatches, files: retried },
    tables: [...loaded.values()].map(({ reader, ...table }) => table) };
  const output = join(root, "data/client-research/quest-marker-item-trace.json");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ itemEvidence, nativeKeys: report.nativeKeys,
    encryptedRetry: { ...report.encryptedRetry, files: undefined }, output }, null, 2));
} finally { storage.close(); }
