/** Match resolved item-site numbers to the same client's Spell variables. */
const variablePattern = /\$\?(?:[A-Za-z]\d+|\$p\d+)\[[^\]]*\]\[[^\]]*\]|\$\/\d+;[sS]\d+|\$\{[^}]+\}(?:\.\d+)?|\$[A-Za-z0-9]+/g;
const fold = (text) => text.toLocaleLowerCase("en-US").replace(/[^a-z0-9%+]/g, "");
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const valuePattern = /^[+-]?\d+(?:[.,]\d+)?(?:\s+(?:to|through|and)\s+[+-]?\d+(?:[.,]\d+)?)?(?:\s*(?:sec(?:onds?)?|min(?:utes?)?|hr|hours?|days?|yds?|yards?|meters?))?%?$/i;
const cancelledDuration = (token, value) =>
  /^\$(?:\d+)?d\d*$/i.test(token) && /^until cancell?ed$/i.test(value);
const grammarPattern = /\$l([^:;]*):([^;]*);/gi;
const branchChoices = Symbol("client spell conditional branches");
const conditionalPrefix = (token) => /^\$\?(?:[A-Za-z]\d+|\$p\d+)/.exec(token)?.[0];
const conditionalContainsWords = (token) => /\p{L}/u.test(token
  .replace(/^\$\?(?:[A-Za-z]\d+|\$p\d+)/, "")
  .replace(/\$[A-Za-z0-9]+/g, ""));
const expandTextConditionals = (template, choices = new Map()) => {
  const match = [...template.matchAll(variablePattern)].find(([token]) =>
    token.startsWith("$?") && conditionalContainsWords(token));
  if (!match) return [{ template, choices }];
  const branches = /^\$\?(?:[A-Za-z]\d+|\$p\d+)\[([^\]]*)\]\[([^\]]*)\]$/.exec(match[0]);
  const key = conditionalPrefix(match[0]);
  if (!branches || !key) return [];
  return branches.slice(1).flatMap((branch, index) => {
    if (choices.has(key) && choices.get(key) !== index) return [];
    const next = new Map(choices);
    next.set(key, index);
    return expandTextConditionals(template.slice(0, match.index) + branch +
      template.slice(match.index + match[0].length), next);
  }).slice(0, 8);
};
const withBranchChoices = (values, choices) => {
  if (choices.size) Object.defineProperty(values, branchChoices, { value: choices });
  return values;
};
const canonicalWording = (text) => text
  .replace(/\b(?:yards?|yds?)\b/gi, "yards")
  .replace(/\b(?:seconds?|sec)\b/gi, "seconds")
  .replace(/\b(?:minutes?|mins?)\b/gi, "minutes")
  .replace(/\buseable\b/gi, "usable")
  .replace(/\bothers members\b/gi, "other members")
  .replace(/\bmutually exclusive with\b/gi, "exclusive with");
const expandEnglishGrammar = (template) => {
  const match = /\$([lg])([^:;]*):([^;]*);/i.exec(template);
  if (!match) return [template];
  const prefix = template.slice(0, match.index);
  const suffix = template.slice(match.index + match[0].length);
  const forms = match[1].toLowerCase() === "g"
    ? [match[2], match[3], `${match[2]}/${match[3]}`] : [match[2], match[3]];
  return forms.flatMap((word) =>
    expandEnglishGrammar(prefix + word + suffix)).slice(0, 8);
};
const rangeConnectors = { deDE: " bis ", esES: " a ", esMX: " a ", frFR: " à ",
  koKR: "~", ptBR: " a ", zhCN: "至", zhTW: "至" };
const durationUnits = {
  deDE: { sec: " Sek.", min: " Min.", hr: " Std." },
  esES: { sec: " s", min: " min", hr: " h" },
  esMX: { sec: " s", min: " min", hr: " h" },
  frFR: { sec: " s", min: " min", hr: " h" },
  koKR: { sec: "초", min: "분", hr: "시간" },
  ptBR: { sec: " s", min: " min", hr: " h" },
  zhCN: { sec: "秒", min: "分钟", hr: "小时" },
  zhTW: { sec: "秒", min: "分鐘", hr: "小時" },
};
const localizeNumber = (value, locale) =>
  ["deDE", "esES", "esMX", "frFR", "ptBR"].includes(locale) ?
    value.replace(".", ",") : value;
const localizeValue = (value, locale) => {
  const range = /^([+-]?\d+(?:[.,]\d+)?)\s+(to|through|and)\s+([+-]?\d+(?:[.,]\d+)?)$/i.exec(value);
  if (range) {
    const connector = range[2] === "and" ?
      { deDE: " und ", esES: " y ", esMX: " y ", frFR: " et ",
        koKR: "과 ", ptBR: " e ", zhCN: "和", zhTW: "與" }[locale] :
      rangeConnectors[locale];
    return localizeNumber(range[1], locale) + connector + localizeNumber(range[3], locale);
  }
  const duration = /^([+-]?\d+(?:[.,]\d+)?)\s*(sec(?:onds?)?|min(?:utes?)?|hr|hours?)$/i.exec(value);
  if (duration) {
    const unit = /^sec/i.test(duration[2]) ? "sec" : /^min/i.test(duration[2]) ? "min" : "hr";
    return localizeNumber(duration[1], locale) + durationUnits[locale][unit];
  }
  if (/^[+-]?\d+(?:[.,]\d+)?%$/.test(value)) {
    return localizeNumber(value.slice(0, -1), locale) + (locale === "frFR" ? "\u00a0%" : "%");
  }
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) return localizeNumber(value, locale);
  return undefined;
};

export const spellVariableSignature = (text) =>
  (text.match(variablePattern) ?? []).sort().join("|");

export function matchLinkedSpellTemplate(template, siteText) {
  for (const variant of expandTextConditionals(template)) {
  for (const expanded of expandEnglishGrammar(variant.template)) {
    for (const [candidate, site] of [[expanded, siteText],
      [canonicalWording(expanded), canonicalWording(siteText)]]) {
      if (!candidate.match(variablePattern)) {
        if (candidate.trim() === site.trim() ||
          (fold(candidate).length >= 12 && fold(candidate) === fold(site))) {
          return withBranchChoices({}, variant.choices);
        }
        continue;
      }
      const values = matchResolvedSpellTemplate(candidate, site);
      if (values) return withBranchChoices(values, variant.choices);
  }
  }
  }
  return undefined;
}

export function matchResolvedSpellTemplate(template, siteText) {
  const variables = [...template.matchAll(variablePattern)];
  if (!variables.length) return undefined;
  const statics = [];
  let end = 0;
  for (const match of variables) {
    statics.push(fold(template.slice(end, match.index)));
    end = match.index + match[0].length;
  }
  statics.push(fold(template.slice(end)));
  if (statics.join("").length < 12) {
    return undefined;
  }
  const folded = "";
  const indexMap = [];
  let site = folded;
  for (let index = 0; index < siteText.length; index += 1) {
    const char = siteText[index].toLocaleLowerCase("en-US");
    if (!/[a-z0-9%+]/.test(char)) continue;
    site += char;
    indexMap.push(index);
  }
  const captures = new Map();
  let patternText = "^" + escapeRegex(statics[0]);
  for (let index = 0; index < variables.length; index += 1) {
    const token = variables[index][0];
    if (!statics[index + 1] && index < variables.length - 1 && !captures.has(token)) {
      return undefined;
    }
    if (!captures.has(token)) {
      captures.set(token, captures.size + 1);
      patternText += token.startsWith("$?") ? "(.*?)" : "(.+?)";
    } else patternText += `\\${captures.get(token)}`;
    patternText += escapeRegex(statics[index + 1]);
  }
  const pattern = new RegExp(patternText + "$", "d");
  const match = pattern.exec(site);
  if (!match) return undefined;
  const values = {};
  for (let index = 0; index < variables.length; index += 1) {
    const token = variables[index][0];
    const [start, end] = match.indices[captures.get(token)];
    const value = start === end ? "" : siteText.slice(indexMap[start], indexMap[end - 1] + 1).trim();
    const conditionalWords = token.startsWith("$?") && conditionalContainsWords(token);
    if ((!(token.startsWith("$?") && value === "") &&
      !valuePattern.test(value) && !cancelledDuration(token, value)) ||
      (conditionalWords && value !== "") ||
      (values[token] && values[token] !== value)) {
      return undefined;
    }
    values[token] = value;
  }
  return values;
}

export function renderResolvedSpellTemplate(template, values, locale, englishResolvedText = "") {
  const choices = values?.[branchChoices];
  const foundChoices = new Set();
  const selectedTemplate = choices ? template.replace(variablePattern, (token) => {
    const key = conditionalPrefix(token);
    if (!key || !choices.has(key)) return token;
    foundChoices.add(key);
    const branches = /^\$\?(?:[A-Za-z]\d+|\$p\d+)\[([^\]]*)\]\[([^\]]*)\]$/.exec(token);
    return branches?.[choices.get(key) + 1] ?? token;
  }) : template;
  if (choices && foundChoices.size !== choices.size) return undefined;
  const localizedTemplate = /^zh/.test(locale) && /\bhis\/her\b/i.test(englishResolvedText)
    ? selectedTemplate.replace(/\$g([^:;]*):([^;]*);/gi, (_, male, female) => `${male}/${female}`)
    : selectedTemplate;
  const tokens = localizedTemplate.replace(grammarPattern, "").match(variablePattern) ?? [];
  const canonical = (token) => token.startsWith("$?")
    ? conditionalPrefix(token) ?? token
    : token.replace(/\s+/g, "");
  const resolved = new Map(Object.entries(values ?? {}).map(([token, value]) => [canonical(token), value]));
  const templateTokens = new Set(tokens.map(canonical));
  const conditionalTokens = tokens.filter((token) => token.startsWith("$?"));
  if (!durationUnits[locale] || !values ||
    tokens.some((token) => !resolved.has(canonical(token))) ||
    conditionalTokens.some((token) => resolved.get(canonical(token)) !== "" &&
      conditionalContainsWords(token)) ||
    new Set(conditionalTokens.map(canonical)).size !== conditionalTokens.length ||
    [...resolved.keys()].some((token) => !templateTokens.has(token))) return undefined;
  let rendered = localizedTemplate.replace(variablePattern, (token) => {
    const value = resolved.get(canonical(token));
    if (token.startsWith("$?") && value === "") return "";
    return localizeValue(value, locale) ?? token;
  });
  rendered = rendered.replace(grammarPattern, (whole, singular, plural, offset) => {
    const preceding = rendered.slice(0, offset).match(/(\d+)(?!.*\d)/);
    return preceding?.[1] === "1" ? singular : plural;
  });
  if (/\$[A-Za-z0-9{]/.test(rendered)) return undefined;
  if (locale === "deDE") {
    rendered = rendered.replace(/(\d+)\s+((?:Schadens|Mana)?[Pp]unkt)\(e\)/g,
      (_, number, stem) => `${number} ${stem}${number === "1" ? "" : "e"}`);
    rendered = rendered.replace(/(\d+)\s+Punkt\(en\)/g,
      (_, number) => `${number} ${number === "1" ? "Punkt" : "Punkten"}`);
    rendered = rendered.replace(/\b(Sek|Min|Std)\.\./g, "$1.");
  }
  rendered = rendered.replace(/\b(\d+[.,]?\d*)\s+(Sek\.|Min\.|Std\.)[ \u00a0]+\2/g, "$1 $2")
    .replace(/\b(\d+[.,]?\d*)\s+(s|min|h)[ \u00a0]+\2\b/g, "$1 $2")
    .replace(/(\d+)(秒|分钟|分鐘|초|분|시간)\2/g, "$1$2");
  return rendered.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n").trim();
}
