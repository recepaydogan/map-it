import fs from "node:fs";
import path from "node:path";

const value = (attribute) => attribute?.value;
const normalizedId = (id) => typeof id === "string" ? id.toLowerCase() : undefined;
const speakerIndex = (index) => (typeof index === "number" || (typeof index === "string" && /^\d+$/.test(index)))
  && Number.isInteger(Number(index)) && Number(index) >= 0 ? Number(index) : undefined;

export const readSpeakerGroups = (sources) => {
  const groups = new Map();
  for (const source of sources) {
    const document = JSON.parse(fs.readFileSync(source, "utf8"));
    const entries = document.save?.regions?.SpeakerGroups?.SpeakerGroup;
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`No speaker groups in ${source}`);
    for (const entry of entries) {
      const id = normalizedId(value(entry.UUID));
      const name = value(entry.Name);
      if (!id || !name) throw new Error(`Incomplete speaker group in ${source}`);
      const previous = groups.get(id);
      if (previous && previous.name !== name) throw new Error(`Conflicting speaker group ${id} in ${source}`);
      groups.set(id, {
        id, name,
        description: value(entry.Description),
        sourcePath: path.relative(process.cwd(), source).split(path.sep).join("/"),
      });
    }
  }
  if (![...groups.values()].some((group) => group.name === "GROUP_Players")) {
    throw new Error("The native GROUP_Players definition is required to resolve dialogue item recipients.");
  }
  return groups;
};

export const readDialogSpeakers = (dialog) => {
  const speakers = (dialog.speakerlist ?? []).flatMap((container) => container.speaker ?? [])
    .map((speaker) => ({
      index: speakerIndex(value(speaker.index)),
      participantIds: [...new Set((value(speaker.list) ?? "").split(";").map((id) => id.trim().toLowerCase()).filter(Boolean))],
    }));
  const seen = new Set();
  for (const speaker of speakers) {
    if (speaker.index === undefined || seen.has(speaker.index)) throw new Error(`Invalid or duplicate dialogue speaker index: ${value(dialog.UUID)}`);
    seen.add(speaker.index);
  }
  return speakers;
};

export const positiveFlagAssignments = (node) => (node.setflags ?? [])
  .flatMap((container) => container.flaggroup ?? [])
  .flatMap((group) => (group.flag ?? [])
    .filter((flag) => value(flag.value) === true)
    .map((flag) => ({
      flagId: normalizedId(value(flag.UUID)),
      nodeId: value(node.UUID),
      flagType: value(group.type),
      targetSpeakerIndex: speakerIndex(value(flag.paramval)),
    })));

const flagTarget = (assignment, speakers, groups, roleReviews) => {
  if (assignment.flagType !== "Object") return { kind: "unresolved", reason: "non-object-flag" };
  const speaker = speakers.find(({ index }) => index === assignment.targetSpeakerIndex);
  if (!speaker?.participantIds.length) return { kind: "unresolved", reason: "missing-speaker-binding" };
  const participantIds = speaker.participantIds;
  const review = roleReviews?.get(speaker.index);
  if (review) {
    if (review.role !== "player" || JSON.stringify(review.participantIds) !== JSON.stringify(participantIds)) {
      throw new Error(`Reviewed speaker role no longer matches: ${review.id}`);
    }
    return { kind: "player", speakerIndex: speaker.index, participantIds,
      binding: "reviewed-dialog-speaker", reviewId: review.id };
  }
  const definitions = participantIds.map((id) => groups.get(id));
  if (definitions.every((group) => group?.name === "GROUP_Players")) {
    return { kind: "player", speakerIndex: speaker.index, participantIds };
  }
  if (definitions.some(Boolean)) {
    return { kind: "unresolved", reason: "unclassified-speaker-group", speakerIndex: speaker.index, participantIds };
  }
  return { kind: participantIds.length === 1 ? "participant" : "participant-alternatives", speakerIndex: speaker.index, participantIds };
};

/** Preserve each native flag target; a choice path may reach different recipients. */
export const resolveDialogItemTransfers = (relations, assignments, speakers, groups, roleReviews) => {
  const effects = new Map();
  for (const relation of relations) {
    for (const assignment of assignments) {
      const target = flagTarget(assignment, speakers, groups, roleReviews);
      let recipient = target;
      let sender;
      if (relation.predicate === "DB_GiveTemplateFromNpcToPlayerDialogEvent") {
        // The native runtime uses the flag target as sender and involved player 1 as recipient.
        if (assignment.flagType === "Object" && target.reason !== "missing-speaker-binding") {
          recipient = { kind: "player", binding: "DialogGetInvolvedPlayer", involvedPlayerIndex: 1 };
          sender = target;
        }
      } else if (relation.predicate === "DB_GiveTemplateFromPlayerDialogEvent") {
        // The reverse runtime contract takes the item from involved player 1
        // and gives it to the flag target, only if magic pockets supply it.
        if (assignment.flagType === "Object" && target.reason !== "missing-speaker-binding") {
          sender = { kind: "player", binding: "DialogGetInvolvedPlayer", involvedPlayerIndex: 1 };
        }
      } else if (!["DB_GiveItemToEvent", "DB_GiveItemToEventWithClear", "DB_GiveNewItemFromTemplateEvent"].includes(relation.predicate)) {
        throw new Error(`Unsupported dialogue item transfer predicate: ${relation.predicate}`);
      }
      const direction = recipient.kind === "player" ? "to-player"
        : recipient.kind.startsWith("participant") ? "to-participant" : "unresolved";
      const key = JSON.stringify([relation.id, direction, recipient, sender]);
      const existing = effects.get(key);
      if (existing) {
        if (!existing.flagAssignments.some((entry) => JSON.stringify(entry) === JSON.stringify(assignment))) {
          existing.flagAssignments.push(assignment);
        }
      } else {
        effects.set(key, { ...relation, direction, recipient, ...(sender ? { sender } : {}), flagAssignments: [assignment] });
      }
    }
  }
  const transfers = [...effects.values()];
  const rewards = transfers.filter((transfer) => transfer.direction === "to-player");
  const itemTransfers = transfers.filter((transfer) => transfer.direction !== "to-player");
  return { ...(rewards.length ? { rewards } : {}), ...(itemTransfers.length ? { itemTransfers } : {}) };
};
