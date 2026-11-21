const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Translate pet families and diets while preserving client ability links and level ranges. */
export function localizeHunterPetTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.families || !labels?.foods ||
    !labels?.new || !labels?.newFamily || !labels?.noneKnownYet) {
    throw new Error("Hunter pet table or labels missing");
  }
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, family, ability, fromLevel, diet, beastLevels) => {
      if (!labels.families[family]) throw new Error(`Missing Hunter pet family ${family}`);
      const translatedDiet = diet.split(", ").map((food) => {
        if (!labels.foods[food]) throw new Error(`Missing Hunter pet food ${food}`);
        return labels.foods[food];
      }).join(", ");
      const localizedAbility = ability.replace(" (new family)", ` (${escapeHtml(labels.newFamily)})`)
        .replace(" (new)", ` (${escapeHtml(labels.new)})`);
      rows += 1;
      return `<tr><td>${escapeHtml(labels.families[family])}</td><td>${localizedAbility}</td>` +
        `<td>${fromLevel}</td><td>${escapeHtml(translatedDiet)}</td>` +
        `<td>${beastLevels === "none known yet" ? escapeHtml(labels.noneKnownYet) : beastLevels}</td></tr>`;
    });
  if (rows !== 18 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Hunter pet rows or links changed: ${rows}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Hunter pet header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
