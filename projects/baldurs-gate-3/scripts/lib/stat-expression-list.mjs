const closingBrackets = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
const closingCharacters = new Set(closingBrackets.values());

/** Split a native list without splitting a function's arguments or quoted text. */
export const splitStatExpressions = (value) => {
  if (value === undefined || value === null || value === "") return [];
  const parts = [];
  const brackets = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  const append = (end) => {
    const part = value.slice(start, end).trim();
    if (part) parts.push(part);
    start = end + 1;
  };
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (closingBrackets.has(character)) {
      brackets.push(closingBrackets.get(character));
    } else if (closingCharacters.has(character)) {
      if (brackets.pop() !== character) {
        throw new Error(`Unmatched bracket at ${index} in native stat list: ${value}`);
      }
    } else if (character === ";" && brackets.length === 0) {
      append(index);
    }
  }
  if (quote !== null || brackets.length > 0) {
    throw new Error(`Unterminated expression in native stat list: ${value}`);
  }
  append(value.length);
  return parts;
};
