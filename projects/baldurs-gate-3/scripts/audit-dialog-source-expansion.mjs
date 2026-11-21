import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-dialog-source-expansion.mjs <old-dialogs> <new-dialogs> <resource-bindings> <old-items> <new-items> <report>");
const [oldPath, newPath, bindingsPath, oldItemsPath, newItemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const read = (file) => {
  const value = fs.readFileSync(file), key = path.relative(root, file).split(path.sep).join("/");
  assert(!hashes[key] || hashes[key] === digest(value)); hashes[key] = digest(value); return JSON.parse(value);
};
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const before = read(oldPath), after = read(newPath), resources = read(bindingsPath), oldItems = read(oldItemsPath), newItems = read(newItemsPath);
assert.deepEqual(omit(before, ["dialogs", "byParticipant", "stats"]), omit(after, ["dialogs", "byParticipant", "stats"]));
for (const [id, dialog] of Object.entries(before.dialogs)) {
  assert(after.dialogs[id], `Existing dialogue removed: ${id}`);
  assert(isDeepStrictEqual(omit(after.dialogs[id], ["participants"]), omit(dialog, ["participants"])), `Unrelated dialogue content changed: ${id}`);
}
assert.deepEqual(omit(newItems, ["generatedAt"]), omit(oldItems, ["generatedAt"]), "Added sources changed item facts or acquisitions");
const added = Object.values(after.dialogs).filter(({ id }) => !before.dialogs[id]), evidence = [], participantCorrections = [];
const dialogsRoot = path.resolve(root, resources.inputs.dialogsRoot);
const sourceModules = [...new Set(Object.values(resources.bindings).map((entry) => entry.module))];
const sourceFiles = sourceModules.flatMap((module) => fs.readdirSync(path.join(dialogsRoot, module), { recursive: true })
  .filter((file) => file.endsWith(".lsj")).map((file) => path.join(dialogsRoot, module, file)));
assert.equal(after.stats.files, sourceFiles.length);
const definitions = new Map();
for (const file of sourceFiles) {
  const source = read(file).save?.regions?.dialog;
  const id = source?.UUID?.value;
  if (!id || !after.dialogs[id]) continue;
  const entries = definitions.get(id) ?? []; entries.push(file); definitions.set(id, entries);
}
const duplicateResolutions = [];
for (const dialog of Object.values(after.dialogs)) {
  const nativePath = `Mods/${dialog.module}/Story/Dialogs/${dialog.provenance}`;
  const bindings = Object.values(resources.bindings).filter((entry) => entry.dialogId === dialog.id && entry.nativeDialogPath === nativePath);
  if (!before.dialogs[dialog.id]) assert(bindings.length, `No exact native resource binding: ${nativePath}`);
  const sourcePath = path.join(dialogsRoot, dialog.module, dialog.provenance);
  for (const binding of bindings) {
    assert.equal(path.resolve(root, binding.dialogSource), sourcePath);
    assert.equal(digest(fs.readFileSync(sourcePath)), resources.hashes[binding.dialogSource]);
  }
  if (definitions.get(dialog.id)?.length > 1) {
    const boundPaths = [...new Set(Object.values(resources.bindings).filter((entry) => entry.dialogId === dialog.id).map((entry) => path.resolve(root, entry.dialogSource)))];
    assert.deepEqual(boundPaths, [sourcePath], `Ambiguous duplicate dialogue: ${dialog.id}`);
    for (const binding of bindings) for (const entry of binding.declarations) {
      const bank = read(path.resolve(root, entry.bankSource));
      assert.equal(hashes[entry.bankSource], resources.hashes[entry.bankSource]);
      const resource = bank.save.regions.DialogBank.Resource[entry.resourceIndex];
      assert.equal(resource.ID.value, binding.resourceId);
      assert.equal(resource.SourceFile.value.replaceAll("\\", "/"), nativePath);
    }
    duplicateResolutions.push({ dialogId: dialog.id, selected: sourcePath, candidates: definitions.get(dialog.id) });
  }
  const source = read(sourcePath).save.regions.dialog;
  assert.equal(source.UUID.value, dialog.id);
  const participants = [];
  for (const container of source.speakerlist ?? []) for (const speaker of container.speaker ?? []) {
    for (const match of (speaker.list?.value ?? "").matchAll(/[^;]+/g)) {
      const id = match[0].trim().toLowerCase();
      if (id && !participants.includes(id)) participants.push(id);
    }
  }
  assert.deepEqual(dialog.participants, participants);
  const previous = before.dialogs[dialog.id];
  if (previous && !isDeepStrictEqual(previous.participants, participants)) {
    participantCorrections.push({ dialogId: dialog.id, before: previous.participants, after: participants });
  }
  const nodes = new Map((source.nodes ?? []).flatMap(({ node }) => node ?? []).map((entry) => [entry.UUID.value, entry]));
  for (const check of dialog.checks) {
    const node = nodes.get(check.id); assert(node);
    for (const [field, native] of [["rollType", "RollType"], ["skill", "Skill"], ["ability", "Ability"]]) assert.equal(check[field], node[native]?.value);
    assert.equal(check.difficultyClassId, node.DifficultyClassID?.value?.toLowerCase() || undefined);
    assert(!check.textHandle || JSON.stringify(node.TaggedTexts).includes(check.textHandle));
  }
  if (previous) continue;
  assert.deepEqual(dialog.approvals, []); assert.deepEqual(dialog.characterChoices, []);
  for (const choice of dialog.choiceOutcomes) {
    const first = nodes.get(choice.id); assert(first); assert.equal(first.constructor.value, choice.nodeType);
    const queue = [first], seen = new Set(), flags = new Set();
    while (queue.length) {
      const current = queue.pop();
      if (!current || seen.has(current.UUID.value)) continue;
      seen.add(current.UUID.value);
      if (current !== first && current.constructor?.value === "TagQuestion") continue;
      for (const group of (current.setflags ?? []).flatMap(({ flaggroup }) => flaggroup ?? [])) {
        for (const flag of group.flag ?? []) if (flag.value?.value === true) flags.add(flag.UUID.value.toLowerCase());
      }
      for (const child of (current.children ?? []).flatMap(({ child }) => child ?? [])) queue.push(nodes.get(child.UUID.value));
    }
    for (const consequence of choice.consequences) {
      assert(flags.has(consequence.id)); assert(!consequence.rewards?.length && !consequence.itemTransfers?.length);
    }
  }
  evidence.push({ dialogId: dialog.id, sourcePath: bindings[0].dialogSource, resourceIds: bindings.map(({ resourceId }) => resourceId), checks: dialog.checks.length, consequentialChoices: dialog.choiceOutcomes.length });
}
const participants = {};
for (const dialog of Object.values(after.dialogs)) for (const id of dialog.participants) (participants[id] ??= []).push(dialog.id);
for (const ids of Object.values(participants)) ids.sort((a, b) => a.localeCompare(b, "en"));
assert.deepEqual(Object.keys(after.byParticipant).sort(), Object.keys(participants).sort());
for (const [id, expected] of Object.entries(participants)) {
  assert(isDeepStrictEqual(after.byParticipant[id], expected), `Participant index differs for ${id}: ${after.byParticipant[id]?.length} rows, expected ${expected.length}`);
}
assert.equal(after.stats.dialogs, Object.keys(after.dialogs).length);
for (const [field, countKey, localizedKey] of [["checks", "checks", "localizedChoices"], ["approvals", "approvalEvents", "localizedApprovalEvents"],
  ["characterChoices", "characterChoices", "localizedCharacterChoices"], ["choiceOutcomes", "choiceOutcomes", "localizedChoiceOutcomes"]]) {
  const entries = Object.values(after.dialogs).flatMap((dialog) => dialog[field]);
  assert.equal(after.stats[countKey], entries.length, countKey);
  assert.equal(after.stats[localizedKey], entries.filter((entry) => entry.localizedText.en).length, localizedKey);
}
const approvals = Object.values(after.dialogs).flatMap((dialog) => dialog.approvals);
const effects = approvals.flatMap((entry) => entry.effects);
const facets = Object.values(after.dialogs).flatMap((dialog) => dialog.characterChoices.flatMap((entry) => entry.facets));
assert.equal(after.stats.approvalRatings, new Set(approvals.map((entry) => `${entry.reactionProvenance.split("/")[0]}:${entry.approvalRatingId}`)).size);
assert.equal(after.stats.approvalOrigins, new Set(effects.map((entry) => entry.originId)).size);
assert.equal(after.stats.filterableApprovalOrigins, new Set(effects.filter((entry) => entry.originFilterEligible).map((entry) => entry.originId)).size);
assert.equal(after.stats.characterOptionTags, new Set(facets.map((entry) => entry.id)).size);
for (const kind of ["class", "race"]) assert.equal(after.stats[`${kind}OptionTags`], new Set(facets.filter((entry) => entry.kind === kind).map((entry) => entry.id)).size);
assert.equal(after.stats.participants, Object.keys(participants).length);
for (const key of ["approvalFiles", "consequenceFlags", "rewardRelations", "unresolvedApprovalEffects"]) assert.equal(after.stats[key], before.stats[key], key);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "native-dialog-source-expansion-conservation", errors: [], oldPath, newPath, bindingsPath, oldItemsPath, newItemsPath,
  stats: { retainedDialogs: Object.keys(before.dialogs).length, addedDialogs: added.length, addedChecks: evidence.reduce((sum, entry) => sum + entry.checks, 0),
    addedConsequentialChoices: evidence.reduce((sum, entry) => sum + entry.consequentialChoices, 0), correctedPreviousParticipants: participantCorrections.length,
    duplicateResolutions: duplicateResolutions.length, checkedSourceFiles: sourceFiles.length, checkedDialogs: Object.keys(after.dialogs).length,
    unchangedItems: newItems.items.length, unchangedAcquisitions: newItems.stats.acquisitionRecords },
  evidence, participantCorrections, duplicateResolutions, beforeStats: before.stats, afterStats: after.stats, hashes,
  scope: "All previous dialogue records are identical except native-proven participant-list corrections; complete item facts and acquisitions are identical. All retained participants, check identities/abilities/skills/text handles, reverse indices and resolved-record statistics are independently reconstructed. Added records have exact installed resource/native dialog bindings and positive consequence paths. Duplicate retained identities have one exact native resource target. Numeric difficulty/localized text formatting is not independently recomputed here. Does not enable map dialogue presentation, prove runtime reachability or authorize publication." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
