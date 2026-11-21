/** Preserve quest evidence and map links while localizing table UI. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizePaladinQuestTables(original, labels, questNames) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([html]) => html);
  if (tables.length !== 2 || labels?.length !== 2) {
    throw new Error("Paladin quest tables or labels missing");
  }
  return tables.map((table, index) => {
    const label = labels[index];
    let result = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
      if (!label.headers?.[english]) throw new Error(`Missing Paladin quest header ${english}`);
      return `<th>${escapeHtml(label.headers[english])}</th>`;
    });
    if (index === 0) {
      let count = 0;
      result = result.replace(/<td>(Humans|Dwarves|Humans and Dwarves)<\/td>/g, (_, english) => {
        if (!label.for?.[english]) throw new Error(`Missing Paladin race label ${english}`);
        count += 1;
        return `<td>${escapeHtml(label.for[english])}</td>`;
      });
      if (count !== 4) throw new Error(`Expected 4 Paladin level-12 rows, found ${count}`);
    } else {
      const rows = (result.match(/<tr><td>/g) ?? []).length;
      if (rows !== 4 || !label.outsideIronforge || !questNames?.["The Test of Righteousness"] ||
        !questNames?.["The Tome of Valor"]) {
        throw new Error(`Expected 4 Paladin level-20 rows, found ${rows}`);
      }
      let translatedNames = 0;
      result = result.replace(/<tr><td>(The Test of Righteousness|The Tome of Valor)<\/td>/g,
        (_, name) => {
          translatedNames += 1;
          return `<tr><td>${escapeHtml(questNames[name])}</td>`;
        });
      if (translatedNames !== 4) throw new Error("Paladin quest title rows changed");
      result = result.replace(/>Outside Ironforge<\/a>/g,
        `>${escapeHtml(label.outsideIronforge)}</a>`);
    }
    return result;
  });
}
