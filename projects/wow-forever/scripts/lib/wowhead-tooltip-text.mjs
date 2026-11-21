/** Read plain spell text from a captured Wowhead tooltip without changing its values. */
export function decodeHtml(value) {
  const named = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: "\u00a0" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi,
    (_, entity) => entity.startsWith("#")
      ? String.fromCodePoint(entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10))
      : named[entity.toLowerCase()]);
}

const genderMarkers = new Map([
  ['<dfn title="sentada">sentado</dfn>', "sentado"],
  ['<dfn title="alimentada">alimentado</dfn>', "alimentado"],
  ['<dfn title="她">他</dfn>', "他"],
  ['<dfn title="déconnectée">déconnecté</dfn>', "déconnecté"],
  ['<dfn title="de la jugadora">del jugador</dfn>', "del jugador"],
  ['<dfn title=" touchée "> touché </dfn>', " touché "],
  ['<dfn title="touchée">touché</dfn>', "touché"],
  ['<dfn title="envoyée">envoyé</dfn>', "envoyé"],
  ['<dfn title="étourdie">étourdi</dfn>', "étourdi"],
  ['<dfn title="protégée">protégé</dfn>', "protégé"],
  ['<dfn title="muerta">muerto</dfn>', "muerto"],
]);

export function description(capture) {
  const html = capture.tooltip.match(/<div class="q">([\s\S]*?)<\/div>/)?.[1]
    ?.replace(/<dfn title="[^"<>]{1,80}">[^<>]{1,80}<\/dfn>/g,
      (marker) => genderMarkers.get(marker) ?? marker);
  if (!html || /<(?:dfn|table|div|script)\b/i.test(html)) return null;
  return decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<span class="tooltip-inside-icon"[^>]*><\/span>/g, "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

// Some Forever spells embed a second spell tooltip as a table in their description.
export function nestedDescription(capture) {
  const html = capture.tooltip.match(/<div class="q">([\s\S]*?)<\/div>/)?.[1];
  if (!html || /<(?:dfn|script|iframe)\b/i.test(html)) return null;
  return decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/gu, " ").trim();
}

export function aura(capture) {
  const buff = capture.buff ?? "";
  const start = buff.lastIndexOf("<table><tr><td>");
  if (start < 0) return null;
  const html = /^<table><tr><td>([\s\S]*?)<\/td><\/tr><\/table>/.exec(buff.slice(start))?.[1];
  if (!html || /<(?:dfn|table|div|script)\b/i.test(html)) return null;
  return decodeHtml(html.replace(/<br\s*\/?\s*>\s*<span class="q">[\s\S]*?<\/span>\s*$/i, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")).trim();
}

export function fullAura(capture) {
  const core = aura(capture);
  if (!core) return null;
  const buff = capture.buff ?? "";
  const plain = (value) => decodeHtml(value.replace(/<[^>]+>/g, "")).trim();
  const type = buff.match(/<th class="q"><b class="q">([\s\S]*?)<\/b><\/th>/)?.[1];
  const duration = [...buff.matchAll(/<br><span class="q">([\s\S]*?)<\/span>/g)]
    .at(-1)?.[1];
  return [type && plain(type), core, duration && plain(duration)]
    .filter(Boolean).join(" ");
}

export const sameWords = (left, right) => left.replace(/\s+/gu, " ").trim() ===
  right.replace(/\s+/gu, " ").trim();

export const resolveLocalizedGrammar = (text, locale) => {
  if (locale === "deDE") return text.replace(/(\d+)\s+Punkt\(e\)/g,
    (_, value) => `${value} ${Number(value) === 1 ? "Punkt" : "Punkte"}`);
  if (locale === "zhCN" || locale === "zhTW") {
    return text.replace(/(\d+)\$l(?=\p{Script=Han})/gu, "$1")
      .replace(/([个個])\$l(?=\p{Script=Han})/gu, "$1");
  }
  return text;
};

export const hasEastAsianEnglishCarryover = (text, locale) =>
  /^(?:koKR|zhCN|zhTW)$/.test(locale) &&
  /(?:[A-Za-z]+[\s,.:;!?-]+){4,}/.test(text);

export const numbers = (value) => (value.match(/\d+(?:[.,]\d+)?/g) ?? [])
  .map((number) => number.replace(",", ".")).sort().join("|");
