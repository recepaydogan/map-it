/** Replace canonical game-link labels with names from the installed client. */
const anchor = /<a\b[^>]*\bdata-guide-link="([^"]+)"[^>]*>([^<]*)<\/a>/g;

export function localizeGuideGameLinks(original, translated, source, locale) {
  const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
  const names = new Map();
  const linkedNames = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    const [table, , field] = source.keys[index].split(":");
    if ((table === "SpellName" && field === "0") ||
      (table === "ItemSparse" && field === "4")) {
      const key = `${table}:${source.values[index]}`;
      const indices = linkedNames.get(key) ?? [];
      indices.push(index);
      linkedNames.set(key, indices);
    }
    if (![["AreaTable", "1"], ["LFGDungeons", "0"], ["Map", "1"], ["ChrClasses", "0"]]
      .some(([wantedTable, wantedField]) => table === wantedTable && field === wantedField)) continue;
    const key = `${table}:${source.values[index]}`;
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(index);
  }
  const originals = [...original.matchAll(anchor)];
  const localized = [...translated.matchAll(anchor)];
  if (originals.length !== localized.length) throw new Error("Item or spell links changed");
  let position = 0;
  const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return translated.replace(anchor, (match, link, translatedLabel) => {
    const [, sourceLink, sourceLabel] = originals[position++] ?? [];
    if (link !== sourceLink) throw new Error("Game link order changed");
    const [kind, id] = link.split(":");
    let value;
    if ((kind === "spell" || kind === "item") && /^\d+$/.test(id)) {
      const table = kind === "spell" ? "SpellName" : "ItemSparse";
      const key = `${table}:${id}:${kind === "spell" ? 0 : 4}`;
      const index = sourceIndices.get(key);
      if (index !== undefined && source.values[index] === sourceLabel) value = locale.values[index];
      if (kind === "spell" && id === "1038" && sourceLabel === "Blessing of Salvation" &&
        source.values[index] === "Salvation") value = locale.values[index];
      if (!value && translatedLabel === sourceLabel) {
        const choices = [...new Set((linkedNames.get(`${table}:${sourceLabel}`) ?? [])
          .map((candidate) => locale.values[candidate]).filter(Boolean))];
        if (choices.length === 1 && choices[0] !== sourceLabel) value = choices[0];
      }
    } else if (kind === "class" && sourceLabel.toLowerCase().replace(/\s+/g, "-") === id) {
      const choices = [...new Set((names.get(`ChrClasses:${sourceLabel}`) ?? [])
        .map((index) => locale.values[index]).filter(Boolean))];
      if (choices.length === 1) value = choices[0];
    } else if (kind === "guide" && id.startsWith("leveling-") &&
      sourceLabel.toLowerCase().replace(/\s+/g, "-") === id.slice("leveling-".length)) {
      const choices = [...new Set((names.get(`ChrClasses:${sourceLabel}`) ?? [])
        .map((index) => locale.values[index]).filter(Boolean))];
      if (choices.length === 1) value = choices[0];
    } else if (kind === "map-pin" && id === "1453" && sourceLabel === "Stormwind City") {
      const index = sourceIndices.get("AreaTable:1519:1");
      if (index !== undefined && source.values[index] === sourceLabel) value = locale.values[index];
    } else if (kind === "dungeon" || kind === "map-pin" || kind === "map-view") {
      for (const table of ["LFGDungeons", "Map", "AreaTable"]) {
        const choices = [...new Set((names.get(`${table}:${sourceLabel}`) ?? [])
          .map((index) => locale.values[index]).filter(Boolean))];
        if (choices.length === 1) { value = choices[0]; break; }
      }
    }
    return value ? match.replace(/>([^<]*)<\/a>$/, `>${escapeHtml(value)}</a>`) : match;
  });
}
