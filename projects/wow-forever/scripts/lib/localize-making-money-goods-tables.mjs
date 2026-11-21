/** Translate guide explanations while retaining every item, recipe, amount, and row. */
const anchorPattern = /<a\b[^>]*\bdata-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g;
const goodsOnly = /^(?:<a\b[^>]*\bdata-guide-link="[^"]+"[^>]*>[^<]*<\/a>)(?:, <a\b[^>]*\bdata-guide-link="[^"]+"[^>]*>[^<]*<\/a>)*$/;
const moneyOnly = /^(?:\d+[gsc])(?:[ ,]+\d+[gsc])*$/;

export function localizeMakingMoneyGoodsTables(original, labels, source, locale, language) {
  if (!labels?.headers || !labels?.cells) throw new Error("Making-money goods table labels missing");
  const areaNames = new Map();
  source.keys.forEach((key, index) => {
    if (!key.startsWith("AreaTable:") || !key.endsWith(":1")) return;
    const english = source.values[index];
    if (!areaNames.has(english)) areaNames.set(english, []);
    if (locale.values[index]) areaNames.get(english).push(locale.values[index]);
  });
  const resolveArea = (english) => {
    const candidates = [...new Set(areaNames.get(english) ?? [])];
    const filtered = candidates.filter((value) => !value.includes("("));
    const preferred = (filtered.length ? filtered : candidates)
      .find((value) => value.includes("’")) ?? (filtered.length ? filtered : candidates)[0];
    if (!preferred) throw new Error(`Missing client area: ${english}`);
    return preferred;
  };
  const separator = language.startsWith("zh") ? "、" : ", ";
  let tables = 0;
  const html = original.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    tables += 1;
    return table.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
      if (!labels.headers[value]) throw new Error(`Missing goods-table header: ${value}`);
      return `<th>${labels.headers[value]}</th>`;
    }).replace(/<td>([\s\S]*?)<\/td>/g, (_, cell) => {
      if (goodsOnly.test(cell) || moneyOnly.test(cell)) return `<td>${cell}</td>`;
      const areas = cell.split(", ");
      if (areas.length > 2 && areas.every((area) => areaNames.has(area))) {
        return `<td>${areas.map(resolveArea).join(separator)}</td>`;
      }
      const anchors = [...cell.matchAll(anchorPattern)].map(([value]) => value);
      let position = 0;
      const english = cell.replace(anchorPattern, () => `{{${position++}}}`);
      const translated = labels.cells[english];
      if (!translated) throw new Error(`Missing goods-table cell: ${english}`);
      const placeholders = [...translated.matchAll(/\{\{(\d+)\}\}/g)].map(([, index]) => Number(index));
      if (JSON.stringify(placeholders) !== JSON.stringify(anchors.map((_, index) => index))) {
        throw new Error(`Goods-table links changed: ${english}`);
      }
      return `<td>${translated.replace(/\{\{(\d+)\}\}/g, (_, index) => anchors[Number(index)])}</td>`;
    });
  });
  if (tables !== 5) throw new Error(`Expected five goods tables, found ${tables}`);
  return html.match(/<table>[\s\S]*?<\/table>/g);
}
