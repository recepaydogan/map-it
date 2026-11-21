/** Preserve client ability links and energy costs while translating usage advice. */
export function localizeRogueEnergyTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.kinds || labels?.notes?.length !== 10) {
    throw new Error("Rogue energy table or translations missing");
  }
  let row = 0;
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Rogue energy header ${english}`);
    return `<th>${labels.headers[english]}</th>`;
  }).replace(/<tr><td>(<a\b[^>]*>[\s\S]*?<\/a>)<\/td><td>([^<]+)<\/td><td>(\d+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, ability, kind, energy) => {
      const translatedKind = labels.kinds[kind];
      const note = labels.notes[row];
      if (!translatedKind || !note) throw new Error(`Missing Rogue energy row ${row}`);
      row += 1;
      return `<tr><td>${ability}</td><td>${translatedKind}</td><td>${energy}</td><td>${note}</td></tr>`;
    });
  if (row !== 10) throw new Error(`Expected 10 Rogue energy rows, found ${row}`);
  return translated;
}
