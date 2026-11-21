import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent of the production role loader and transfer classifier.
const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.join(root, "map-sources/audits/dialog-checks-explicit-item-flags.json");
const afterPath = path.join(root, "map-sources/audits/dialog-checks-reviewed-speaker-roles.json");
const reviewPath = path.join(root, "map-sources/config/dialog-speaker-role-reviews.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = {};
const readText = (filename) => {
  const bytes = fs.readFileSync(filename);
  hashes[path.relative(root, filename).split(path.sep).join("/")] = hash(bytes);
  return bytes.toString("utf8");
};
const read = (filename) => JSON.parse(readText(filename));
const before = read(beforePath), after = read(afterPath), reviews = read(reviewPath);
const expected = structuredClone(before), changes = [], errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
check(reviews.sourceBuild === before.sourceBuild, "Review source build differs from dialog source build");
expected.speakerRoleReviews = reviews;
for (const review of reviews.entries) {
  const dialog = expected.dialogs[review.dialogId];
  check(Boolean(dialog), `Reviewed dialog absent: ${review.id}`);
  if (!dialog) continue;
  const native = read(path.join(root, review.dialogSource.sourcePath)).save.regions.dialog;
  const bank = read(path.join(root, review.resourceBank.sourcePath)).save.regions.DialogBank.Resource;
  const resource = bank.filter((entry) => entry.ID?.value === review.resourceId);
  check(resource.length === 1 && resource[0].SourceFile?.value === review.nativeDialogPath, `Wrong resource binding: ${review.id}`);
  check(native.UUID.value === dialog.id, `Wrong native dialog: ${review.id}`);
  const speaker = native.speakerlist.flatMap(({ speaker }) => speaker ?? []).find((entry) => String(entry.index.value) === String(review.speakerIndex));
  const participants = speaker?.list.value.split(";").map((id) => id.trim().toLowerCase()).filter(Boolean);
  check(isDeepStrictEqual(participants, review.participantIds), `Wrong native participant slot: ${review.id}`);
  check(review.role === "player", `Unsupported reviewed role: ${review.id}`);
  for (const evidence of [review.dialogSource, review.resourceBank, ...review.evidence]) {
    const text = readText(path.join(root, evidence.sourcePath));
    check(hashes[evidence.sourcePath] === evidence.sha256, `Changed reviewed source: ${evidence.sourcePath}`);
    for (const line of evidence.lines ?? []) {
      check(Number.isInteger(line) && Boolean(text.split(/\r?\n/)[line - 1]?.trim()), `Empty/missing evidence line: ${evidence.sourcePath}:${line}`);
    }
  }
  const nodes = new Map(native.nodes.flatMap(({ node }) => node ?? []).map((node) => [node.UUID.value, node]));
  let changed = 0;
  for (const choice of dialog.choiceOutcomes) for (const consequence of choice.consequences) {
    const retained = [];
    for (const effect of consequence.itemTransfers ?? []) {
      if (effect.recipient.speakerIndex !== review.speakerIndex) {
        retained.push(effect);
        continue;
      }
      check(effect.direction === "unresolved" && effect.recipient.reason === "unclassified-speaker-group"
        && isDeepStrictEqual(effect.recipient.participantIds, review.participantIds), `Unexpected previous recipient: ${dialog.id}/${choice.id}/${effect.id}`);
      check(effect.flagAssignments?.length > 0, `Missing native flag evidence: ${effect.id}`);
      for (const assignment of effect.flagAssignments ?? []) {
        const flags = (nodes.get(assignment.nodeId)?.setflags ?? []).flatMap(({ flaggroup }) => flaggroup ?? [])
          .flatMap((group) => (group.flag ?? []).map((flag) => ({ type: group.type.value, flag })));
        check(assignment.flagType === "Object" && assignment.targetSpeakerIndex === review.speakerIndex
          && flags.some(({ type, flag }) => type === "Object" && flag.UUID.value === assignment.flagId
            && flag.value.value === true && flag.paramval.value === review.speakerIndex), `Flag does not target reviewed native slot: ${assignment.nodeId}`);
      }
      const reward = { ...effect, direction: "to-player", recipient: { kind: "player", speakerIndex: review.speakerIndex,
        participantIds: review.participantIds, binding: "reviewed-dialog-speaker", reviewId: review.id } };
      (consequence.rewards ??= []).push(reward);
      changes.push({ dialogId: dialog.id, choiceId: choice.id, relationId: effect.id, reviewId: review.id });
      changed += 1;
    }
    if (retained.length) consequence.itemTransfers = retained;
    else delete consequence.itemTransfers;
  }
  check(changed > 0, `Review resolved no item effect: ${review.id}`);
}
check(isDeepStrictEqual(expected, after), "Catalog differs beyond the exact reviewed recipient reclassification");
for (const [relative, expectedHash] of Object.entries(hashes)) {
  check(hash(fs.readFileSync(path.join(root, relative))) === expectedHash, `Audit source changed during comparison: ${relative}`);
}
const report = { scope: "Complete catalog conservation except exact reviewed speaker-role effects; independent resource, dialog, slot and native positive-flag binding checks. Reviewed runtime call-chain source hashes are pinned; this is not a general story-call solver or a guarantee that every branch grants an item.",
  stats: { dialogs: Object.keys(after.dialogs).length, reviews: reviews.entries.length, reclassifiedEffects: changes.length }, hashes, changes, errors };
writeGeneratedFile(path.join(root, "map-sources/audits/dialog-speaker-role-delta-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
