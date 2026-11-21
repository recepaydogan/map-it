import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.join(root, "map-sources/audits/staged-source-transfer-items/item-database.json");
const stageRoot = path.resolve(root, process.argv[2] ?? "map-sources/audits/staged-dialog-transfer-items");
const afterPath = path.join(stageRoot, "item-database.json");
const dialogPath = path.resolve(root, process.argv[3] ?? "map-sources/audits/dialog-checks-transfer-direction.json");
const resolutionPath = path.join(stageRoot, "dialog-item-transfer-resolution.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath), dialogs = read(dialogPath), resolution = read(resolutionPath);
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const signature = (acquisition) => JSON.stringify(omit(acquisition, ["id"]));
const errors = [], changes = [], unresolved = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const nextItems = new Map(after.items.map((item) => [item.id, item]));
const dialogKeys = new Set();
const expected = new Map();
const key = (title, detail) => JSON.stringify([title, detail ?? ""]);
for (const dialog of Object.values(dialogs.dialogs)) for (const choice of dialog.choiceOutcomes) {
  for (const consequence of choice.consequences) for (const effect of [...(consequence.rewards ?? []), ...(consequence.itemTransfers ?? [])]) {
    dialogKeys.add(key(dialog.title, choice.localizedText.en));
    expected.set(JSON.stringify([dialog.id, choice.id, effect.id, effect.direction, effect.recipient]), { dialog, choice, effect });
  }
}
check(isDeepStrictEqual(before.items.map((item) => item.id).sort(), after.items.map((item) => item.id).sort()), "Item identities changed");
check(isDeepStrictEqual(before.recipes, after.recipes) && isDeepStrictEqual(before.categories, after.categories), "Crafting/category data changed");
const supportedAdditions = new Set();
const seen = new Set();
for (const row of resolution.entries) {
  const relationKey = JSON.stringify([row.dialogId, row.choiceId, row.relationId, row.direction, row.recipient]);
  const source = expected.get(relationKey);
  check(source && !seen.has(relationKey), `Unexpected/duplicate resolution row: ${relationKey}`);
  seen.add(relationKey);
  if (!source) continue;
  const { dialog, choice, effect } = source;
  for (const itemId of row.itemIds) {
    const item = nextItems.get(itemId);
    check(item?.templateIds.includes(row.templateId) && (!row.statsId || row.statsId === item.statsId), `Item identity differs from resolved template/Stats: ${itemId}/${effect.id}`);
    const matches = (item?.acquisitions ?? []).filter((acquisition) => acquisition.detail === choice.localizedText.en);
    const matching = matches.filter((acquisition) => effect.direction === "to-player"
      ? acquisition.kind === "reward" && acquisition.certainty === "scripted" && acquisition.source === dialog.title
      : effect.direction === "to-participant" && effect.recipient.kind === "participant"
        && ["carried", "container"].includes(acquisition.kind) && acquisition.certainty === "story"
        && acquisition.sourceId === effect.recipient.participantIds[0]);
    if (effect.sender?.kind === "player") {
      check(row.status === "outgoing-player-transfer", `Outgoing player transfer has acquisition status: ${relationKey}`);
      check(matching.length === 0, `Player handover advertised as acquisition: ${relationKey}`);
      continue;
    }
    if (row.status.startsWith("unresolved")) {
      check(matching.length === 0, `Unresolved transfer produced an acquisition: ${relationKey}`);
      continue;
    }
    check(matching.length > 0, `Resolved transfer missing from item acquisitions: ${relationKey}/${itemId}`);
    for (const acquisition of matching) {
      check((acquisition.amount ?? 1) === effect.amount, `Transfer amount differs: ${relationKey}`);
      check(isDeepStrictEqual(acquisition.localizedDetails, choice.localizedText), `Choice translations changed: ${relationKey}`);
      supportedAdditions.add(`${itemId}:${signature(acquisition)}`);
    }
  }
  if (row.status.startsWith("unresolved")) unresolved.push(row);
}
check(isDeepStrictEqual([...seen].sort(), [...expected.keys()].sort()), "Transfer-resolution coverage is incomplete");
for (const previous of before.items) {
  const current = nextItems.get(previous.id);
  if (!current) continue;
  check(isDeepStrictEqual(omit(previous, ["acquisitions"]), omit(current, ["acquisitions"])), `Non-acquisition item data changed: ${previous.id}`);
  const old = new Set(previous.acquisitions.map(signature)), next = new Set(current.acquisitions.map(signature));
  const removed = previous.acquisitions.filter((acquisition) => !next.has(signature(acquisition)));
  const added = current.acquisitions.filter((acquisition) => !old.has(signature(acquisition)));
  for (const acquisition of removed) check(acquisition.kind === "reward" && dialogKeys.has(key(acquisition.source, acquisition.detail)), `Unrelated acquisition removed: ${previous.id}/${acquisition.id}`);
  for (const acquisition of added) check(supportedAdditions.has(`${previous.id}:${signature(acquisition)}`), `Unsupported acquisition added: ${previous.id}/${acquisition.id}`);
  if (removed.length || added.length) changes.push({ itemId: previous.id, item: previous.name, removed, added });
}
const report = {
  scope: "Complete item-definition/non-dialogue acquisition conservation, transfer coverage, direction, quantity, localized-choice and item-resolution consistency audit. This does not resolve unknown recipients or independently prove native placement/template provenance.",
  hashes: { before: hash(beforePath), after: hash(afterPath), dialogs: hash(dialogPath), resolution: hash(resolutionPath) },
  stats: { items: after.items.length, checkedEffects: resolution.entries.length, changedItems: changes.length,
    previousLinks: before.stats.acquisitionRecords, currentLinks: after.stats.acquisitionRecords,
    removedLinks: changes.reduce((count, entry) => count + entry.removed.length, 0),
    addedLinks: changes.reduce((count, entry) => count + entry.added.length, 0), unresolvedRecipients: unresolved.length,
    outgoingPlayerTransfers: resolution.entries.filter(({ status }) => status === "outgoing-player-transfer").length },
  changes, unresolved, errors,
};
writeGeneratedFile(path.join(stageRoot, "acquisition-delta-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
