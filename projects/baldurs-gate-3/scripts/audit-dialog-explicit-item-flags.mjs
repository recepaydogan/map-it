import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseEndpoint, readStoryFacts } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.join(root, "map-sources/audits/dialog-checks-player-handover.json");
const afterPath = path.join(root, "map-sources/audits/dialog-checks-explicit-item-flags.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath);
const errors = [], additions = [], inputs = {}, newChoices = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const assignmentKey = (entry) => JSON.stringify([entry.flagId, entry.nodeId, entry.flagType, entry.targetSpeakerIndex]);
const relationKey = (entry) => JSON.stringify([entry.predicate, entry.itemId, entry.flagId, entry.amount]);
const nativeByFlag = new Map();
for (const fact of readStoryFacts([path.join(root, "map-sources/extracted/story-goals")], root)) {
  if (fact.section !== "init" || fact.negated || /SavegamePatches/i.test(fact.evidence.sourcePath)
    || !/^DB_(?:GiveNewItemFromTemplateEvent|GiveTemplateFrom(?:NpcToPlayer|Player)DialogEvent|GiveItemToEvent(?:WithClear)?)$/.test(fact.predicate)) continue;
  const item = parseEndpoint(fact.arguments[0]), flag = parseEndpoint(fact.arguments[1]);
  if (!item || !flag || /debug/i.test(flag.name)) continue;
  const template = /Template/.test(fact.predicate), amount = template ? Number(fact.arguments.at(-1)) : 1;
  const relation = { predicate: fact.predicate, itemId: item.id, flagId: flag.id, flagName: flag.name, amount, kind: template ? "template" : "placed-item", fact };
  const relations = nativeByFlag.get(flag.id) ?? new Map();
  if (!relations.has(relationKey(relation))) relations.set(relationKey(relation), relation);
  nativeByFlag.set(flag.id, relations);
}
const groups = new Map();
for (const source of new Set(Object.values(after.speakerGroups).map((group) => group.sourcePath))) {
  inputs[source] = hash(path.join(root, source));
  for (const group of read(path.join(root, source)).save.regions.SpeakerGroups.SpeakerGroup) groups.set(group.UUID.value.toLowerCase(), group.Name.value);
}
const translations = {};
for (const [language, directory] of [["en", "english"], ["tr", "turkish"]]) {
  const source = `map-sources/converted/localization/${directory}/${directory}.xml`;
  inputs[source] = hash(path.join(root, source));
  translations[language] = new Map([...fs.readFileSync(path.join(root, source), "utf8").matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)]
    .map(([, id, value]) => [id, value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'").replaceAll("&amp;", "&").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()]));
}
check(isDeepStrictEqual(omit(before, ["dialogs", "stats"]), omit(after, ["dialogs", "stats"])), "Unrelated catalog/index metadata changed");
check(isDeepStrictEqual(omit(before.stats, ["consequenceFlags", "choiceOutcomes", "localizedChoiceOutcomes"]), omit(after.stats, ["consequenceFlags", "choiceOutcomes", "localizedChoiceOutcomes"])), "Unrelated catalog statistics changed");
check(isDeepStrictEqual(Object.keys(before.dialogs), Object.keys(after.dialogs)), "Dialogue identities/order changed");
for (const [dialogId, oldDialog] of Object.entries(before.dialogs)) {
  const dialog = after.dialogs[dialogId];
  if (!dialog) continue;
  check(isDeepStrictEqual(omit(oldDialog, ["choiceOutcomes"]), omit(dialog, ["choiceOutcomes"])), `Unrelated dialogue data changed: ${dialogId}`);
  const previousChoices = new Map(oldDialog.choiceOutcomes.map((choice) => [choice.id, choice]));
  check(isDeepStrictEqual(oldDialog.choiceOutcomes.map(({ id }) => id), dialog.choiceOutcomes.filter(({ id }) => previousChoices.has(id)).map(({ id }) => id)), `Existing choices removed/reordered: ${dialogId}`);
  let native, nodes, speakers;
  const loadNative = () => {
    if (native) return;
    const source = path.join("map-sources/extracted/dialogs", dialog.module, dialog.provenance);
    native = read(path.join(root, source)).save.regions.dialog;
    inputs[source] = hash(path.join(root, source));
    check(native.UUID.value === dialogId, `Native dialogue identity differs: ${dialogId}`);
    nodes = new Map(native.nodes.flatMap(({ node }) => node ?? []).map((node) => [node.UUID.value, node]));
    speakers = native.speakerlist.flatMap(({ speaker }) => speaker ?? []);
  };
  for (const choice of dialog.choiceOutcomes) {
    const previous = previousChoices.get(choice.id);
    const previousFlags = new Set(previous?.consequences.map(({ id }) => id) ?? []);
    if (previous) {
      check(isDeepStrictEqual(omit(previous, ["consequences"]), omit(choice, ["consequences"])), `Existing choice fields changed: ${dialogId}/${choice.id}`);
      check(isDeepStrictEqual(previous.consequences, choice.consequences.filter(({ id }) => previousFlags.has(id))), `Existing consequences changed/removed: ${dialogId}/${choice.id}`);
    }
    const added = choice.consequences.filter(({ id }) => !previousFlags.has(id));
    if (!added.length) continue;
    loadNative();
    const label = `${dialogId}/${choice.id}`;
    const sourceChoice = nodes.get(choice.id);
    check(sourceChoice?.constructor?.value === "TagQuestion" && choice.nodeType === "TagQuestion"
      && choice.speakerIndex === Number(sourceChoice?.speaker?.value ?? -1)
      && choice.consequenceScope === "choice-path-before-next-question", `New choice is not the native question: ${label}`);
    if (!previous) {
      check(JSON.stringify(sourceChoice?.TaggedTexts).includes(choice.textHandle), `Choice text handle not present in native question: ${label}`);
      const expectedText = Object.fromEntries(Object.entries(translations).map(([language, entries]) => [language, entries.get(choice.textHandle)]).filter(([, text]) => text));
      check(expectedText.en && isDeepStrictEqual(choice.localizedText, expectedText), `Native choice translations differ: ${label}`);
      newChoices.push(label);
    }
    const pending = [choice.id], visited = new Set(), assignments = [];
    while (pending.length) {
      const id = pending.pop(), node = nodes.get(id);
      if (!node || visited.has(id) || id !== choice.id && node.constructor?.value === "TagQuestion") continue;
      visited.add(id);
      for (const container of node.setflags ?? []) for (const group of container.flaggroup ?? []) for (const flag of group.flag ?? []) {
        if (flag.value?.value === true) assignments.push({ flagId: flag.UUID.value.toLowerCase(), nodeId: id, flagType: group.type.value, targetSpeakerIndex: flag.paramval?.value });
      }
      for (const container of node.children ?? []) for (const child of container.child ?? []) pending.push(child.UUID.value);
    }
    for (const consequence of added) {
      const relations = nativeByFlag.get(consequence.id);
      const effects = [...(consequence.rewards ?? []), ...(consequence.itemTransfers ?? [])];
      check(relations?.size > 0 && [...relations.values()].some(({ flagName }) => flagName === consequence.internalName), `New consequence lacks normal native item registration: ${label}/${consequence.id}`);
      if (!relations) continue;
      check(isDeepStrictEqual([...new Set(effects.map(relationKey))].sort(), [...relations.keys()].sort()), `New consequence has missing/extra item relations: ${label}/${consequence.id}`);
      const expectedAssignments = [...new Set(assignments.filter(({ flagId }) => flagId === consequence.id).map(assignmentKey))].sort();
      check(expectedAssignments.length > 0, `Consequence not reached in native question path: ${label}/${consequence.id}`);
      for (const key of relations.keys()) check(isDeepStrictEqual(expectedAssignments, effects.filter((effect) => relationKey(effect) === key).flatMap((effect) => effect.flagAssignments ?? []).map(assignmentKey).sort()), `Native assignments not covered exactly once: ${label}/${key}`);
      for (const effect of effects) {
        const relation = relations.get(relationKey(effect));
        if (!relation) continue;
        check(effect.kind === relation.kind, `Native item kind differs: ${label}/${effect.id}`);
        const evidence = relation.fact.evidence;
        inputs[evidence.sourcePath] = hash(path.join(root, evidence.sourcePath));
        check(effect.evidence.sourcePath === evidence.sourcePath && effect.evidence.sourceLine === evidence.sourceLine
          && effect.evidence.statement.replace(/;\s*$/, "").replace(/\s+/g, " ") === evidence.statement, `Native registration evidence differs: ${label}`);
        for (const assignment of effect.flagAssignments ?? []) {
          const speaker = speakers.find((entry) => assignment.targetSpeakerIndex !== undefined && Number(entry.index.value) === assignment.targetSpeakerIndex);
          const ids = [...new Set((speaker?.list?.value ?? "").split(";").map((id) => id.trim().toLowerCase()).filter(Boolean))];
          const bound = assignment.flagType === "Object" && ids.length > 0;
          const involvedPlayer = bound && effect.predicate === "DB_GiveTemplateFromNpcToPlayerDialogEvent";
          const isPlayer = bound && ids.every((id) => groups.get(id) === "GROUP_Players");
          const participant = bound && ids.every((id) => !groups.has(id));
          check(effect.direction === (involvedPlayer || isPlayer ? "to-player" : participant ? "to-participant" : "unresolved"), `Incorrect native transfer direction: ${label}`);
          const target = involvedPlayer ? effect.sender : effect.recipient;
          if (bound) check(isDeepStrictEqual(target?.participantIds, ids) && target?.speakerIndex === assignment.targetSpeakerIndex, `Native speaker binding differs: ${label}`);
          if (involvedPlayer || bound && effect.predicate === "DB_GiveTemplateFromPlayerDialogEvent") {
            const player = involvedPlayer ? effect.recipient : effect.sender;
            check(player?.binding === "DialogGetInvolvedPlayer" && player.involvedPlayerIndex === 1 && player.kind === "player", `Incorrect involved-player binding: ${label}`);
          }
          check((effect.direction === "to-player" ? consequence.rewards : consequence.itemTransfers)?.includes(effect), `Effect stored under wrong direction: ${label}`);
        }
        additions.push({ dialogId, dialogTitle: dialog.title, choiceId: choice.id, choice: choice.localizedText.en, flagId: consequence.id,
          itemId: effect.itemId, item: effect.title, direction: effect.direction, recipient: effect.recipient, evidence });
      }
    }
  }
}
check(after.stats.choiceOutcomes - before.stats.choiceOutcomes === newChoices.length
  && after.stats.localizedChoiceOutcomes - before.stats.localizedChoiceOutcomes === newChoices.length, "New native choices do not explain catalog count changes");
const runtime = "map-sources/extracted/story-support/shared-item-events/_GLOBAL_ItemEvents.txt";
inputs[runtime] = hash(path.join(root, runtime));
const report = { scope: "Complete preservation of the preceding catalog, plus native registration, flag reachability, speaker, transfer direction, amount and new-choice translation evidence for newly admitted item flags. This does not prove all native dialogues/branches are represented or guarantee conditional outcomes.",
  hashes: { before: hash(beforePath), after: hash(afterPath), sources: inputs },
  stats: { dialogs: Object.keys(after.dialogs).length, newChoices: newChoices.length, addedEffects: additions.length,
    addedFlags: new Set(additions.map(({ flagId }) => flagId)).size, playerEffects: additions.filter(({ direction }) => direction === "to-player").length },
  additions, newChoices, errors };
writeGeneratedFile(path.join(root, "map-sources/audits/dialog-explicit-item-flag-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
