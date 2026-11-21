/** Reject reviewed Wowhead locale text that describes a different quest variant. */
import { readFile } from "node:fs/promises";

const review = JSON.parse(await readFile(new URL(
  "../../data/quest-text-localization/rejected-semantic-prose.json", import.meta.url), "utf8"));
if (review.version !== 1 || !Array.isArray(review.rules)) {
  throw new Error("Invalid semantic quest prose review");
}
const rejected = new Map();
for (const entry of review.rules) {
  const key = `${entry.id}:${entry.locale}:${entry.field}`;
  if (!/^\d+:(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW):(?:description|objective|progressText|completionText)$/.test(key) ||
    rejected.has(key) || !entry.english?.trim() || !entry.localized?.trim() ||
    !entry.reason?.trim()) {
    throw new Error(`Invalid semantic quest prose rejection: ${key}`);
  }
  rejected.set(key, entry);
}

export const isRejectedSemanticProse = (id, locale, field, english, localized) => {
  const entry = rejected.get(`${id}:${locale}:${field}`);
  return Boolean(entry && entry.english === english && entry.localized === localized);
};

export const rejectedSemanticProse = review.rules;
