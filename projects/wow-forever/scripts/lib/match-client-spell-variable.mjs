/** Match client Spell descriptions whose numeric variables were resolved by the item site. */
const variablePattern = /\$[A-Za-z][A-Za-z0-9]*/g;
const escapeStatic = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  .replace(/\s+/g, "\\s+");
const foldFormatting = (text) => text.toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}$+%/~-]+/gu, "");

export const numberSignature = (text) => (text.match(/\d+/g) ?? []).sort().join("|");
export const variableSignature = (text) => (text.match(variablePattern) ?? [])
  .sort().join("|");

export function matchNumericSpellTemplate(template, siteText) {
  const variables = [];
  let strictPattern = "^";
  let formattedPattern = "^";
  let end = 0;
  for (const match of template.matchAll(variablePattern)) {
    const staticText = template.slice(end, match.index);
    strictPattern += escapeStatic(staticText) + "([+-]?\\d+(?:[.,]\\d+)?)";
    formattedPattern += escapeStatic(foldFormatting(staticText)) + "([+-]?\\d+)";
    variables.push(match[0]);
    end = match.index + match[0].length;
  }
  if (!variables.length) return undefined;
  strictPattern += escapeStatic(template.slice(end)) + "$";
  formattedPattern += escapeStatic(foldFormatting(template.slice(end))) + "$";
  const match = new RegExp(strictPattern, "iu").exec(siteText) ??
    new RegExp(formattedPattern, "iu").exec(foldFormatting(siteText));
  if (!match) return undefined;
  const values = {};
  for (const [index, token] of variables.entries()) {
    const value = match[index + 1];
    if (values[token] && values[token] !== value) return undefined;
    values[token] = value;
  }
  return values;
}

export function renderNumericSpellTemplate(template, values) {
  const tokens = template.match(variablePattern) ?? [];
  if (!tokens.length || tokens.some((token) => !Object.hasOwn(values, token)) ||
    Object.keys(values).some((token) => !tokens.includes(token))) return undefined;
  return template.replace(variablePattern, (token) => values[token] ?? token);
}
