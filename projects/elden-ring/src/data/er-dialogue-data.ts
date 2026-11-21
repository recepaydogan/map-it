import raw from "./generated/er-dialogue.json";

/**
 * The Elden Ring NPC dialogue archive — the game's complete spoken script, grouped
 * per speaker in playback order. Built by data/src/build-er-dialogue.mjs straight from
 * the player's own extracted TalkMsg FMGs (base + Shadow of the Erdtree); nothing here
 * is hand-written.
 *
 * The FMG carries no speaker names, so each speaker is identified honestly:
 *   • "named"    — the character names themselves in their own lines ("I am Melina").
 *   • "inferred" — fixed by NpcName id-band alignment and/or unambiguous story context.
 *   • "unknown"  — left "Unknown speaker" rather than risk a wrong name.
 */
export type DialogueConfidence = "named" | "inferred" | "unknown";

export interface DialogueConversation {
  /** The talk-script conversation id (id // 1000) — a stable key, in play order. */
  id: number;
  lines: string[];
}

export interface DialogueSpeaker {
  /** Speaker prefix: the base-game talk band ("106") or a DLC one ("dlc:118"). */
  id: string;
  name: string;
  confidence: DialogueConfidence;
  conversations: DialogueConversation[];
}

// `as unknown as` (not a plain `as`): the generated JSON widens `confidence` to
// `string` and per-row line arrays trip a direct cast — see nightreign-data.ts.
const data = raw as unknown as { patch: string; speakers: DialogueSpeaker[] };

export const erDialoguePatch: string = data.patch;

/** All speakers, ordered by line count descending (biggest questlines first), Narration last. */
export const erDialogueSpeakers: DialogueSpeaker[] = data.speakers;

/** Total spoken lines for a speaker (shown on the rail). */
export const dialogueLineCount = (s: DialogueSpeaker): number =>
  s.conversations.reduce((n, c) => n + c.lines.length, 0);
