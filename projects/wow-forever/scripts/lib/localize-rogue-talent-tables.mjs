/** Keep every published talent allocation and client link while translating advice. */
export function localizeRogueTalentTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([html]) => html);
  if (tables.length !== 2 || labels?.length !== 2) {
    throw new Error("Rogue talent tables or translations missing");
  }
  return tables.map((table, index) => {
    const label = labels[index];
    let row = 0;
    const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
      if (!label.headers?.[english]) throw new Error(`Missing Rogue talent header ${english}`);
      return `<th>${label.headers[english]}</th>`;
    }).replace(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><\/tr>/g,
      (_, _build, talents) => {
        const build = label.builds?.[row];
        const reason = label.reasons?.[row];
        if (!build || !reason) throw new Error(`Missing Rogue talent row ${index}/${row}`);
        row += 1;
        return `<tr><td>${build}</td><td>${talents}</td><td>${reason}</td></tr>`;
      });
    if (row !== 3) throw new Error(`Expected 3 Rogue talent builds, found ${row}`);
    return translated;
  });
}
