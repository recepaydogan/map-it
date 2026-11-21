/** Match the runtime guard for changed numeric quest objectives in locale audits. */
export function hasConflictingQuestObjectiveNumbers(english, localized) {
  const numbers = (value) => new Set((value.normalize("NFKC")
    .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
  const source = numbers(english);
  const translated = numbers(localized);
  return [...source].some((number) => !translated.has(number)) &&
    [...translated].some((number) => !source.has(number));
}
