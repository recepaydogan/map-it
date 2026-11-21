/** Apply reviewed same-ID, same-English fields from Blizzard build 70790. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const reviewed = await read("data/spell-tooltip-localization/reviewed-native-gap-fields.json");
if (reviewed.version !== 1 || reviewed.build !== 70790 ||
  !Array.isArray(reviewed.fields) ||
  new Set(reviewed.fields.map(({ id, field }) => `${id}:${field}`)).size !==
    reviewed.fields.length ||
  reviewed.fields.some(({ id, field, reason, allowExpressionVariables }) =>
    !Number.isSafeInteger(id) || id < 1 || !["r", "d", "a"].includes(field) ||
    typeof reason !== "string" || !reason.trim() ||
    (allowExpressionVariables !== undefined &&
      (allowExpressionVariables !== true || field !== "d")))) {
  throw new Error("Invalid reviewed native fields");
}
const dir = "data/spell-tooltip-localization/native-70790";
const english = await read(`${dir}/enUS.json`);
if (english.build !== reviewed.build || english.locale !== "enUS") {
  throw new Error("Unexpected English client build");
}
const details = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, { native: await read(`${dir}/${locale}.json`),
    pack: await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`) }])));
const expressionMatch = (template, source) => {
  const tokens = [...template.matchAll(/\$\{[^}]+\}|\$[A-Za-z0-9]+/g)];
  if (!tokens.length || new Set(tokens.map((match) => match[0])).size !== tokens.length) {
    return undefined;
  }
  const statics = [];
  let end = 0;
  for (const match of tokens) {
    statics.push(template.slice(end, match.index));
    end = match.index + match[0].length;
  }
  statics.push(template.slice(end));
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${statics.map((value, index) =>
    escape(value) + (index < tokens.length ? "([\\s\\S]*?)" : "")).join("")}$`);
  const captured = pattern.exec(source);
  if (!captured) return undefined;
  const values = {};
  let complex;
  for (const [index, token] of tokens.entries()) {
    const value = captured[index + 1];
    if (/^\([0-9 ./*+\-]+\)$/.test(value) && token[0].startsWith("${")) {
      if (complex) return undefined;
      complex = { token: token[0], value };
      values[token[0]] = "999999";
    } else if (/^\d+(?:[.,]\d+)?(?:\s*(?:sec|seconds?|min|minutes?))?%?$/.test(value)) {
      values[token[0]] = value;
    } else return undefined;
  }
  return complex && !source.includes("999999") ? { values, complex } : undefined;
};
let additions = 0;
for (const { id, field, allowExpressionVariables } of reviewed.fields) {
  const detail = details[id];
  const nativeEnglish = english.spells[id];
  const index = { r: 0, d: 1, a: 2 }[field];
  const template = nativeEnglish?.fields?.[index];
  const expression = allowExpressionVariables && template && detail?.[field]
    ? expressionMatch(template, detail[field]) : undefined;
  const variables = expression?.values ?? (field === "r" ?
    (template === detail?.r ? {} : undefined) :
    (template && detail?.[field] ? matchLinkedSpellTemplate(template, detail[field]) : undefined));
  if (!detail?.[field] || nativeEnglish?.name !== detail.n ||
    variables === undefined) {
    throw new Error(`${id}/${field}: current English client row does not match`);
  }
  for (const locale of locales) {
    const { native, pack } = packs[locale];
    if (native.build !== reviewed.build || native.locale !== locale ||
      pack.locale !== locale || pack.version !== 1) {
      throw new Error(`${locale}: client or pack mismatch`);
    }
    if (pack.entries[id]?.[field]) continue;
    const localizedTemplate = native.spells[id]?.fields?.[index];
    if (!localizedTemplate || localizedTemplate === template) continue;
    let value = field === "r" ? localizedTemplate :
      renderResolvedSpellTemplate(localizedTemplate, variables, locale, detail[field]);
    if (expression && value) {
      if (value.split("999999").length !== 2) {
        throw new Error(`${id}/${locale}: reviewed expression did not render once`);
      }
      value = value.replace("999999", expression.complex.value);
    }
    if (!value || value === detail[field] || /\$[A-Za-z0-9{]/.test(value) ||
      numbers(value) !== numbers(detail[field]) ||
      hasEastAsianEnglishCarryover(value, locale)) continue;
    (pack.entries[id] ??= {})[field] = value;
    additions++;
  }
}
if (check && additions) throw new Error(`${additions} reviewed native fields are missing`);
if (!check) {
  for (const locale of locales) {
    const path = join(root, `public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    const original = await readFile(path, "utf8");
    const output = JSON.stringify(packs[locale].pack) +
      (original.endsWith("\n") ? "\n" : "");
    if (output === original) continue;
    for (let attempt = 0; attempt < 8; attempt++) {
      try { await writeFile(path, output); break; }
      catch (error) {
        if (!["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(error.code) ||
          attempt === 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
}
console.log(`${additions} reviewed native spell tooltip fields added`);
