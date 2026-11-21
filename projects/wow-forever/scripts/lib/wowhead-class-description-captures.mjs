/** Validated ID and locale indexed Wowhead class tooltip captures. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const sameClassDescriptionText = (left, right) => {
  const normalize = (value) => value.replace(/\s+([:),\]])/g, "$1")
    .replace(/([([])\s+/g, "$1").replace(/\s+/g, " ").trim();
  return normalize(left) === normalize(right);
};

export async function loadWowheadClassDescriptions(root) {
  const path = join(root, "data/site-research/wowhead-class-description-gaps.jsonl");
  const captures = new Map();
  const locales = new Set(["en", "de", "es", "mx", "fr", "ko", "pt", "cn", "tw"]);
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.id}:${record.locale}`;
    const url = `https://nether.wowhead.com/forever/${record.locale === "en" ?
      "" : `${record.locale}/`}tooltip/spell/${record.id}`;
    if (!Number.isSafeInteger(record.id) || record.id < 1 ||
      !locales.has(record.locale) || record.url !== url ||
      typeof record.name !== "string" || !record.name.trim() ||
      (record.text !== null && (typeof record.text !== "string" || !record.text.trim())) ||
      captures.has(key)) throw new Error(`Invalid Wowhead class capture: ${key}`);
    captures.set(key, record);
  }
  return captures;
}

export async function loadWowheadTalentNames(root) {
  const path = join(root, "data/site-research/wowhead-talent-name-gap-captures.jsonl");
  const captures = new Map();
  const locales = new Set(["en", "de", "es", "mx", "fr", "ko", "pt", "cn", "tw"]);
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.talentId}:${record.locale}`;
    const url = `https://nether.wowhead.com/forever/${record.locale === "en" ?
      "" : `${record.locale}/`}tooltip/spell/${record.spellId}`;
    if (!Number.isSafeInteger(record.talentId) || !Number.isSafeInteger(record.spellId) ||
      !locales.has(record.locale) || record.url !== url ||
      typeof record.sourceName !== "string" || !record.sourceName.trim() ||
      typeof record.name !== "string" || !record.name.trim() || captures.has(key)) {
      throw new Error(`Invalid Wowhead talent name capture: ${key}`);
    }
    captures.set(key, record);
  }
  return captures;
}
