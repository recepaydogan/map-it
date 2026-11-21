import type { SkillDamageRecord } from "./reference-types";

const damageRange = /…\s*[-–]\s*…(?=\s+(?:\w+\s+)?damage\b)/gi;
const healingRange = /…\s*[-–]\s*…(?=\s+HP\b)/gi;

/** Fill a damage placeholder only when its effect can be identified without guessing. */
export const skillDamageDescription = (
  text: string,
  damage: SkillDamageRecord | null,
  level: number,
  language: string,
  baseValue: (base: string) => string,
): string => {
  if (!damage) return text;
  const number = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 2 });
  const range = (min: number, max: number) => {
    const first = number(min);
    const last = number(max);
    return first === last ? first : `${first}–${last}`;
  };
  let result = text;
  const placeholders = [...result.matchAll(damageRange)];
  const damageRanges = damage.damageRanges ?? (damage.effects.length === 1 && placeholders.length === 1
    ? [[damage.effects[0].id, damage.effects[0].id]] : []);
  if (placeholders.length === damageRanges.length) {
    const effects = new Map(damage.effects.map((effect) => [effect.id, effect]));
    let index = 0;
    result = result.replace(damageRange, (placeholder) => {
      const pair = damageRanges[index++];
      if (!pair) return "";
      const [minId, maxId] = pair;
      const min = effects.get(minId)?.levels.find((entry) => entry[0] === level);
      const max = effects.get(maxId)?.levels.find((entry) => entry[0] === level);
      return min && max ? baseValue(range(min[1], max[2])) : placeholder;
    }).replace(/ {2,}/g, " ");
  }
  if (damage.healing?.length === 1 && [...result.matchAll(healingRange)].length === 1) {
    const values = damage.healing[0].levels.find((entry) => entry[0] === level);
    if (values) result = result.replace(healingRange, baseValue(range(values[1], values[2])));
  }
  return result;
};
