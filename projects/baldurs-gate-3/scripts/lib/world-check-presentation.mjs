import fs from "node:fs";
import path from "node:path";

const storyRoot = path.resolve(import.meta.dirname, "../../map-sources/extracted/story-goals");
const sources = new Map();

/** Prove that success unlocks interaction with an initially inaccessible object. */
export const checkRevealsHiddenFeature = (check, source) => {
  if (!check.successFlagId && !check.checkId) return false;
  if (source === undefined) {
    const file = path.resolve(storyRoot, check.provenance);
    const relative = path.relative(storyRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid check source path");
    if (!sources.has(file)) sources.set(file, fs.readFileSync(file, "utf8"));
    source = sources.get(file);
  }
  const text = source.replace(/\/\/[^\r\n]*/g, "");
  const interactions = (body, enabled) => [...body.matchAll(new RegExp(
    `SetCanInteract\\([^;]*?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}),\\s*${enabled}\\s*\\)`, "gi",
  ))].map((match) => match[1].toLowerCase());
  const hidden = new Set(interactions(text.split("KBSECTION")[0], 0));
  return text.split(/\r?\n(?:IF|PROC|QRY)\r?\n/).some((rule) => {
    const [conditions, effects] = rule.split(/\r?\nTHEN\r?\n/);
    const successFlag = check.successFlagId && conditions.includes(check.successFlagId)
      && /(?:FlagSet|DB_GlobalFlag)\(/.test(conditions)
      && !/NOT\s+(?:FlagSet|DB_GlobalFlag)\(/.test(conditions);
    const successCallback = check.checkId && conditions.includes(`"${check.checkId}"`)
      && conditions.includes(check.targetObjectId)
      && /^PROC_GLO_KnowledgeCheckSuccess\(/.test(conditions);
    return effects && (successFlag || successCallback)
      && interactions(effects, 1).some((id) => hidden.has(id));
  });
};

/** Checks describe interactions; only explicit world features qualify as secrets. */
export const worldCheckCategories = (checks) => [...new Set(checks
  .flatMap((check) => check.category !== "secret" ? [check.category]
    : checkRevealsHiddenFeature(check) ? ["secret"] : []))];

/** Combat groups remain evidence even when story events initially disable combat. */
export const isHostileCharacter = (record) => !record.partyMember
  && (Boolean(record.combatGroupId) || (record.factionHostile === true
    && record.characterCapabilities?.canFight !== false
    && record.characterCapabilities?.canJoinCombat !== false));

export const hasSecretFeature = (record) => Boolean(
  record.flags?.secretDoor || record.hiddenPassage || record.diggableSecret
  || record.worldChecks?.checks.some((check) => checkRevealsHiddenFeature(check))
  || record.mechanism?.sequence?.role === "result"
  || record.mechanism?.movements?.some(({ action }) => [
    "opens-secret-passage", "opens-closes-secret-passage", "reveals-hidden-safe",
  ].includes(action))
  || record.secretPuzzle?.role === "target"
  || record.crechePuzzle?.role === "result"
  || record.balthazarSecretRoom?.role === "door",
);

/** Reclassify legacy check-only secrets without touching explicit feature categories. */
export const worldCheckTargetKind = (record) => {
  if (record.candidateKind !== "secret" || !record.worldChecks || hasSecretFeature(record)) {
    return record.candidateKind;
  }
  if (record.placementKind === "characters") return isHostileCharacter(record) ? "enemy" : "npc";
  return worldCheckCategories(record.worldChecks.checks)[0] ?? "interactable";
};
