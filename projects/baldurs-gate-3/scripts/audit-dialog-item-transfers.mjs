import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readStoryFacts, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent native-data audit: deliberately does not import the producer's
// recipient classifier or its graph traversal.
const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.resolve(root, process.argv[2] ?? "map-sources/catalog/dialog-checks.json");
const afterPath = path.resolve(root, process.argv[3] ?? "map-sources/audits/dialog-checks-transfer-direction.json");
const outputPath = path.resolve(root, process.argv[4] ?? "map-sources/audits/dialog-item-transfer-audit.json");
if ([beforePath, afterPath].includes(outputPath)) throw new Error("Audit output must not replace either input catalog.");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath);
const errors = [], reviews = [], changedChoices = [], inputs = new Map();
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const canonical = (value) => JSON.stringify(value);
const assignmentKey = (entry) => canonical([entry.flagId, entry.nodeId, entry.flagType, entry.targetSpeakerIndex]);
const sourceKey = (entry) => `${entry.sourcePath}:${entry.sourceLine}:${entry.statement.replace(/;\s*$/, "").replace(/\s+/g, " ")}`;
const nativeFacts = new Map(readStoryFacts([path.join(root, "map-sources/extracted/story-goals")], root)
  .map((fact) => [sourceKey(fact.evidence), fact]));
const runtimePath = path.join(root, "map-sources/extracted/story-support/shared-item-events/_GLOBAL_ItemEvents.txt");
inputs.set(path.relative(root, runtimePath), hash(runtimePath));
const nativeGroups = new Map();
for (const source of new Set(Object.values(after.speakerGroups ?? {}).map((group) => group.sourcePath))) {
  const file = path.join(root, source);
  inputs.set(source, hash(file));
  for (const group of read(file).save.regions.SpeakerGroups.SpeakerGroup) {
    nativeGroups.set(group.UUID.value.toLowerCase(), group.Name.value);
  }
}
check(nativeGroups.size > 0, "Missing native speaker-group evidence");
for (const group of Object.values(after.speakerGroups ?? {})) {
  check(nativeGroups.get(group.id) === group.name, `Speaker-group definition mismatch: ${group.id}`);
}
check(isDeepStrictEqual(omit(before, ["schemaVersion", "dialogs", "speakerGroups"]), omit(after, ["schemaVersion", "dialogs", "speakerGroups"])), "Unrelated catalog metadata changed");
check(isDeepStrictEqual(Object.keys(before.dialogs).sort(), Object.keys(after.dialogs).sort()), "Dialogue identities changed");
const stats = { dialogs: Object.keys(after.dialogs).length, choices: 0, previousRewardEffects: 0, playerRewardEffects: 0, participantTransferEffects: 0, unresolvedTransferEffects: 0, checkedAssignments: 0 };
const uniqueAssignments = new Set();
for (const [dialogId, previousDialog] of Object.entries(before.dialogs)) {
  const dialog = after.dialogs[dialogId];
  if (!dialog) continue;
  check(isDeepStrictEqual(omit(previousDialog, ["choiceOutcomes"]), omit(dialog, ["choiceOutcomes"])), `Unrelated dialogue fields changed: ${dialogId}`);
  const nextChoices = new Map(dialog.choiceOutcomes.map((choice) => [choice.id, choice]));
  check(isDeepStrictEqual(previousDialog.choiceOutcomes.map((choice) => choice.id), dialog.choiceOutcomes.map((choice) => choice.id)), `Choice identities/order changed: ${dialogId}`);
  const hasTransfers = previousDialog.choiceOutcomes.some((choice) => choice.consequences.some((consequence) => consequence.rewards?.length));
  const sourcePath = path.join("map-sources/extracted/dialogs", dialog.module, dialog.provenance);
  const native = hasTransfers ? read(path.join(root, sourcePath)).save.regions.dialog : undefined;
  const nodes = new Map((native?.nodes ?? []).flatMap((container) => container.node ?? []).map((node) => [node.UUID.value, node]));
  const speakers = (native?.speakerlist ?? []).flatMap((container) => container.speaker ?? []);
  if (hasTransfers) inputs.set(sourcePath.split(path.sep).join("/"), hash(path.join(root, sourcePath)));
  for (const previousChoice of previousDialog.choiceOutcomes) {
    stats.choices += 1;
    const choice = nextChoices.get(previousChoice.id);
    if (!choice) continue;
    check(isDeepStrictEqual(omit(previousChoice, ["consequences"]), omit(choice, ["consequences"])), `Choice text/scope changed: ${dialogId}/${choice.id}`);
    check(isDeepStrictEqual(previousChoice.consequences.map((entry) => entry.id), choice.consequences.map((entry) => entry.id)), `Consequence identities/order changed: ${dialogId}/${choice.id}`);
    const reached = new Map();
    const pending = [choice.id];
    while (hasTransfers && pending.length) {
      const id = pending.pop();
      if (reached.has(id)) continue;
      const node = nodes.get(id);
      if (!node || id !== choice.id && node.constructor?.value === "TagQuestion") continue;
      reached.set(id, node);
      for (const container of node.children ?? []) for (const child of container.child ?? []) pending.push(child.UUID.value);
    }
    let reclassified = false;
    for (const previousConsequence of previousChoice.consequences) {
      const consequence = choice.consequences.find((entry) => entry.id === previousConsequence.id);
      if (!consequence) continue;
      check(isDeepStrictEqual(omit(previousConsequence, ["rewards", "itemTransfers"]), omit(consequence, ["rewards", "itemTransfers"])), `Consequence description changed: ${dialogId}/${choice.id}/${consequence.id}`);
      const originals = new Map((previousConsequence.rewards ?? []).map((reward) => [reward.id, reward]));
      stats.previousRewardEffects += originals.size;
      const effects = [...(consequence.rewards ?? []), ...(consequence.itemTransfers ?? [])];
      check(isDeepStrictEqual([...originals.keys()].sort(), [...new Set(effects.map((effect) => effect.id))].sort()), `Transfer lost/introduced: ${dialogId}/${choice.id}/${consequence.id}`);
      const assignments = [];
      for (const [nodeId, node] of reached) {
        for (const container of node.setflags ?? []) for (const group of container.flaggroup ?? []) for (const flag of group.flag ?? []) {
          if (flag.value?.value !== true || flag.UUID?.value?.toLowerCase() !== consequence.id) continue;
          assignments.push({ flagId: consequence.id, nodeId, flagType: group.type?.value, targetSpeakerIndex: flag.paramval?.value });
        }
      }
      for (const relationId of originals.keys()) {
        const actual = effects.filter((effect) => effect.id === relationId).flatMap((effect) => effect.flagAssignments ?? []).map(assignmentKey).sort();
        check(isDeepStrictEqual([...new Set(assignments.map(assignmentKey))].sort(), actual), `Native flag assignments not conserved exactly once: ${dialogId}/${choice.id}/${relationId}`);
      }
      for (const effect of effects) {
        const label = `${dialogId}/${choice.id}/${effect.id}`;
        check(isDeepStrictEqual(originals.get(effect.id), omit(effect, ["direction", "recipient", "sender", "flagAssignments"])), `Native item relation changed: ${label}`);
        const fact = nativeFacts.get(sourceKey(effect.evidence));
        check(fact && !fact.negated && fact.predicate === effect.predicate, `Inactive/mismatched item relation: ${label}`);
        if (fact) {
          check(parseEndpoint(fact.arguments[0])?.id === effect.itemId && parseEndpoint(fact.arguments[1])?.id === effect.flagId, `Native item/flag arguments differ: ${label}`);
        }
        check(effect.flagAssignments?.length > 0, `No source-node evidence: ${label}`);
        for (const assignment of effect.flagAssignments ?? []) {
          stats.checkedAssignments += 1;
          uniqueAssignments.add(`${dialogId}/${assignmentKey(assignment)}`);
          check(assignments.some((candidate) => assignmentKey(candidate) === assignmentKey(assignment)), `Non-native/unreachable flag assignment: ${label}`);
          const target = speakers.find((speaker) => assignment.targetSpeakerIndex !== undefined && Number(speaker.index.value) === assignment.targetSpeakerIndex);
          const ids = [...new Set((target?.list?.value ?? "").split(";").map((id) => id.trim().toLowerCase()).filter(Boolean))];
          const isObject = assignment.flagType === "Object";
          const involvedPlayer = isObject && ids.length > 0 && effect.predicate === "DB_GiveTemplateFromNpcToPlayerDialogEvent";
          const playerGroup = isObject && ids.length && ids.every((id) => nativeGroups.get(id) === "GROUP_Players");
          const participant = isObject && ids.length && ids.every((id) => !nativeGroups.has(id));
          const expectedDirection = involvedPlayer || playerGroup ? "to-player" : participant ? "to-participant" : "unresolved";
          check(effect.direction === expectedDirection, `Recipient direction differs from native contract: ${label}`);
          const boundTarget = involvedPlayer ? effect.sender : effect.recipient;
          if (isObject && ids.length) check(isDeepStrictEqual(boundTarget?.participantIds, ids) && boundTarget?.speakerIndex === assignment.targetSpeakerIndex, `Speaker identity/alternatives lost: ${label}`);
          if (involvedPlayer) check(effect.recipient.binding === "DialogGetInvolvedPlayer" && effect.recipient.involvedPlayerIndex === 1, `Wrong involved-player binding: ${label}`);
        }
        if (effect.direction === "to-player") {
          stats.playerRewardEffects += 1;
          check((consequence.rewards ?? []).includes(effect), `Player reward stored outside rewards: ${label}`);
        } else {
          reclassified = true;
          check((consequence.itemTransfers ?? []).includes(effect), `Non-player/unknown transfer still presented as reward: ${label}`);
          if (effect.direction === "to-participant") stats.participantTransferEffects += 1;
          else stats.unresolvedTransferEffects += 1;
          reviews.push({ dialogId, dialogTitle: dialog.title, choiceId: choice.id, choice: choice.localizedText.en,
            itemId: effect.itemId, item: effect.title, predicate: effect.predicate, direction: effect.direction, recipient: effect.recipient });
        }
      }
    }
    if (reclassified) changedChoices.push(`${dialogId}/${choice.id}`);
  }
}
stats.uniqueNativeAssignments = uniqueAssignments.size;
stats.reclassifiedChoices = changedChoices.length;
const report = {
  scope: "Complete previous-catalog conservation and native reachable flag/speaker/item-argument audit. Runtime direction contracts were reviewed in the original shared item-event source. Conditional paths are not guaranteed outcomes. Named origin participants and unresolved group/global/dialog targets require further role/trigger review before publication.",
  beforePath, afterPath, hashes: { before: hash(beforePath), after: hash(afterPath), nativeInputs: Object.fromEntries(inputs) },
  stats, changedChoices, reviews, errors,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
