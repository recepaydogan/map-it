import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseEndpoint, readStoryFacts } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare the additional transfer family against native rules and native
// dialogue graphs without calling the producer's parser or classification.
const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.join(root, "map-sources/audits/dialog-checks-transfer-direction.json");
const afterPath = path.join(root, "map-sources/audits/dialog-checks-player-handover.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath);
const predicate = "DB_GiveTemplateFromPlayerDialogEvent";
const errors = [], additions = [], represented = new Set(), sourceHashes = {};
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const effectKey = (entry) => JSON.stringify([entry.itemId, entry.flagId, entry.amount]);
const assignmentKey = (entry) => JSON.stringify([entry.flagId, entry.nodeId, entry.flagType, entry.targetSpeakerIndex]);
const nativeRelations = new Map();
for (const fact of readStoryFacts([path.join(root, "map-sources/extracted/story-goals")], root)) {
  if (fact.predicate !== predicate || fact.negated || fact.section !== "init" || /SavegamePatches/i.test(fact.evidence.sourcePath)) continue;
  const item = parseEndpoint(fact.arguments[0]), flag = parseEndpoint(fact.arguments[1]);
  const amount = Number(fact.arguments[3]);
  check(item && flag && Number.isInteger(amount) && amount > 0, `Invalid native handover arguments: ${fact.evidence.sourcePath}:${fact.evidence.sourceLine}`);
  if (!item || !flag) continue;
  const relation = { itemId: item.id, flagId: flag.id, amount, fact };
  nativeRelations.set(effectKey(relation), relation);
  sourceHashes[fact.evidence.sourcePath] = hash(path.join(root, fact.evidence.sourcePath));
}
const runtimePath = path.join(root, "map-sources/extracted/story-support/shared-item-events/_GLOBAL_ItemEvents.txt");
sourceHashes[path.relative(root, runtimePath)] = hash(runtimePath);
const groups = new Map();
for (const source of new Set(Object.values(after.speakerGroups).map((group) => group.sourcePath))) {
  sourceHashes[source] = hash(path.join(root, source));
  for (const group of read(path.join(root, source)).save.regions.SpeakerGroups.SpeakerGroup) groups.set(group.UUID.value.toLowerCase(), group.Name.value);
}
check(isDeepStrictEqual(omit(before, ["dialogs", "stats"]), omit(after, ["dialogs", "stats"])), "Unrelated catalog metadata changed");
check(isDeepStrictEqual(omit(before.stats, ["rewardRelations"]), omit(after.stats, ["rewardRelations"])), "Unrelated catalog statistics changed");
check(after.stats.rewardRelations === before.stats.rewardRelations + nativeRelations.size, "Native relation count does not explain the catalog delta");
check(isDeepStrictEqual(Object.keys(before.dialogs).sort(), Object.keys(after.dialogs).sort()), "Dialogue identities changed");
let choices = 0;
for (const [dialogId, oldDialog] of Object.entries(before.dialogs)) {
  const dialog = after.dialogs[dialogId];
  if (!dialog) continue;
  check(isDeepStrictEqual(omit(oldDialog, ["choiceOutcomes"]), omit(dialog, ["choiceOutcomes"])), `Unrelated dialogue data changed: ${dialogId}`);
  check(isDeepStrictEqual(oldDialog.choiceOutcomes.map(({ id }) => id), dialog.choiceOutcomes.map(({ id }) => id)), `Choice identities/order changed: ${dialogId}`);
  const relevant = dialog.choiceOutcomes.some((choice) => choice.consequences.some((consequence) => [...nativeRelations.values()].some(({ flagId }) => flagId === consequence.id)));
  const source = path.join("map-sources/extracted/dialogs", dialog.module, dialog.provenance);
  const native = relevant ? read(path.join(root, source)).save.regions.dialog : undefined;
  if (native) sourceHashes[source] = hash(path.join(root, source));
  const nodes = new Map((native?.nodes ?? []).flatMap((container) => container.node ?? []).map((node) => [node.UUID.value, node]));
  const speakers = (native?.speakerlist ?? []).flatMap((container) => container.speaker ?? []);
  for (const oldChoice of oldDialog.choiceOutcomes) {
    choices += 1;
    const choice = dialog.choiceOutcomes.find(({ id }) => id === oldChoice.id);
    if (!choice) continue;
    check(isDeepStrictEqual(omit(oldChoice, ["consequences"]), omit(choice, ["consequences"])), `Choice text/scope changed: ${dialogId}/${choice.id}`);
    check(isDeepStrictEqual(oldChoice.consequences.map(({ id }) => id), choice.consequences.map(({ id }) => id)), `Consequence identities/order changed: ${dialogId}/${choice.id}`);
    const reached = new Map(), pending = [choice.id];
    while (native && pending.length) {
      const id = pending.pop(), node = nodes.get(id);
      if (!node || reached.has(id) || id !== choice.id && node.constructor?.value === "TagQuestion") continue;
      reached.set(id, node);
      for (const container of node.children ?? []) for (const child of container.child ?? []) pending.push(child.UUID.value);
    }
    for (const oldConsequence of oldChoice.consequences) {
      const consequence = choice.consequences.find(({ id }) => id === oldConsequence.id);
      if (!consequence) continue;
      const preserved = { ...consequence };
      for (const key of ["rewards", "itemTransfers"]) if (preserved[key]) {
        preserved[key] = preserved[key].filter((effect) => effect.predicate !== predicate);
        if (!preserved[key].length) delete preserved[key];
      }
      const label = `${dialogId}/${choice.id}/${consequence.id}`;
      check(isDeepStrictEqual(oldConsequence, preserved), `Existing consequence/effect changed: ${label}`);
      const effects = [...(consequence.rewards ?? []), ...(consequence.itemTransfers ?? [])].filter((effect) => effect.predicate === predicate);
      const expected = [...nativeRelations.values()].filter(({ flagId }) => flagId === consequence.id);
      check(isDeepStrictEqual([...new Set(effects.map(effectKey))].sort(), expected.map(effectKey).sort()), `Native handover omitted/introduced: ${label}`);
      const assignments = [];
      for (const [nodeId, node] of reached) for (const container of node.setflags ?? []) for (const group of container.flaggroup ?? []) for (const flag of group.flag ?? []) {
        if (flag.value?.value === true && flag.UUID?.value?.toLowerCase() === consequence.id) assignments.push({ flagId: consequence.id, nodeId, flagType: group.type.value, targetSpeakerIndex: flag.paramval?.value });
      }
      for (const relation of expected) {
        const actual = effects.filter((effect) => effectKey(effect) === effectKey(relation)).flatMap((effect) => effect.flagAssignments ?? []).map(assignmentKey).sort();
        check(isDeepStrictEqual([...new Set(assignments.map(assignmentKey))].sort(), actual), `Flag assignments not covered exactly once: ${label}/${relation.itemId}`);
      }
      for (const effect of effects) {
        const relation = nativeRelations.get(effectKey(effect));
        check(effect.kind === "template" && relation, `Incorrect native item identity: ${label}/${effect.id}`);
        if (!relation) continue;
        represented.add(effectKey(relation));
        check(effect.evidence.sourcePath === relation.fact.evidence.sourcePath && effect.evidence.sourceLine === relation.fact.evidence.sourceLine
          && effect.evidence.statement.replace(/;\s*$/, "").replace(/\s+/g, " ") === relation.fact.evidence.statement, `Native registration evidence changed: ${label}`);
        for (const assignment of effect.flagAssignments ?? []) {
          const speaker = speakers.find((entry) => assignment.targetSpeakerIndex !== undefined && Number(entry.index.value) === assignment.targetSpeakerIndex);
          const ids = [...new Set((speaker?.list?.value ?? "").split(";").map((id) => id.trim().toLowerCase()).filter(Boolean))];
          const bound = assignment.flagType === "Object" && ids.length > 0;
          const isPlayer = bound && ids.every((id) => groups.get(id) === "GROUP_Players");
          const isParticipant = bound && ids.every((id) => !groups.has(id));
          const direction = isPlayer ? "to-player" : isParticipant ? "to-participant" : "unresolved";
          check(effect.direction === direction, `Incorrect recipient direction: ${label}`);
          if (bound) {
            check(isDeepStrictEqual(effect.recipient.participantIds, ids) && effect.recipient.speakerIndex === assignment.targetSpeakerIndex, `Recipient identity changed: ${label}`);
            check(isDeepStrictEqual(effect.sender, { kind: "player", binding: "DialogGetInvolvedPlayer", involvedPlayerIndex: 1 }), `Missing/wrong involved-player sender: ${label}`);
          } else check(!effect.sender, `Unproven sender: ${label}`);
          check((direction === "to-player" ? consequence.rewards : consequence.itemTransfers)?.includes(effect), `Effect stored under wrong direction: ${label}`);
        }
        additions.push({ dialogId, title: dialog.title, choiceId: choice.id, choice: choice.localizedText.en, itemId: effect.itemId, recipient: effect.recipient, direction: effect.direction, evidence: effect.evidence });
      }
    }
  }
}
const report = {
  scope: "All existing catalog data/effects conserved. Every newly supported player-to-participant transfer is checked against native INIT registration arguments, native reachable positive flags, recipient slots and the manually reviewed involved-player runtime contract. Paths stop at the next question; availability/success remains conditional. Relations outside stored choice paths are reported, not claimed covered.",
  stats: { dialogs: Object.keys(after.dialogs).length, choices, nativeRelations: nativeRelations.size, representedRelations: represented.size,
    addedEffects: additions.length, changedChoices: new Set(additions.map(({ dialogId, choiceId }) => `${dialogId}/${choiceId}`)).size },
  hashes: { before: hash(beforePath), after: hash(afterPath), nativeSources: sourceHashes },
  additions, unrepresentedRelations: [...nativeRelations].filter(([key]) => !represented.has(key)).map(([, relation]) => relation), errors,
};
writeGeneratedFile(path.join(root, "map-sources/audits/dialog-player-handover-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
