/** Reject only reviewed quest prose with a proven conflicting quantity. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const review = JSON.parse(await readFile(new URL(
  "../../data/quest-text-localization/rejected-numeric-prose.json", import.meta.url), "utf8"));
if (review.version !== 1 || !Array.isArray(review.fields)) {
  throw new Error("Invalid numeric quest prose review");
}
const rejected = new Map();
for (const entry of review.fields) {
  const key = `${entry.id}:${entry.locale}:${entry.field}`;
  if (!/^\d+:(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW):(?:description|objective|progressText|completionText)$/.test(key) ||
    rejected.has(key) || !/^[a-f0-9]{64}$/.test(entry.englishSha256) ||
    !/^[a-f0-9]{64}$/.test(entry.localizedSha256) || !entry.reason?.trim()) {
    throw new Error(`Invalid numeric quest prose rejection: ${key}`);
  }
  rejected.set(key, entry);
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const isRejectedNumericProse = (id, locale, field, english, localized) => {
  const entry = rejected.get(`${id}:${locale}:${field}`);
  return Boolean(entry && typeof english === "string" && typeof localized === "string" &&
    sha256(english) === entry.englishSha256 &&
    sha256(localized) === entry.localizedSha256);
};
