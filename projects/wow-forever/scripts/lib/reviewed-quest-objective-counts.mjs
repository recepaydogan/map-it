/** Apply reviewed quantity changes to exact client quest objective versions. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const review = JSON.parse(await readFile(new URL(
  "../../data/quest-text-localization/reviewed-objective-number-corrections.json",
  import.meta.url), "utf8"));
if (review.version !== 1 || !Array.isArray(review.fields)) {
  throw new Error("Invalid reviewed quest objective numbers");
}
const rules = new Map();
for (const rule of review.fields) {
  const key = `${rule.id}:${rule.locale}`;
  if (!/^\d+:(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)$/.test(key) ||
    rules.has(key) || !/^[a-f0-9]{64}$/.test(rule.englishSha256) ||
    !/^[a-f0-9]{64}$/.test(rule.localizedSha256) ||
    !Array.isArray(rule.from) || !Array.isArray(rule.to) ||
    !rule.from.length || rule.from.length !== rule.to.length ||
    [...rule.from, ...rule.to].some((value) => !/^\d+(?:[.,]\d+)?$/.test(value))) {
    throw new Error(`Invalid reviewed quest objective numbers: ${key}`);
  }
  rules.set(key, rule);
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const numbers = (value) => value.match(/\d+(?:[.,]\d+)?/g) ?? [];
export const correctReviewedQuestObjectiveCounts = (id, locale, english, localized) => {
  const rule = rules.get(`${id}:${locale}`);
  if (!rule || typeof english !== "string" || typeof localized !== "string" ||
    sha256(english) !== rule.englishSha256 ||
    sha256(localized) !== rule.localizedSha256 ||
    numbers(english).join("|") !== rule.to.join("|") ||
    numbers(localized).join("|") !== rule.from.join("|")) return localized;
  let index = 0;
  return localized.replace(/\d+(?:[.,]\d+)?/g, () => rule.to[index++]);
};
