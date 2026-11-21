/** Keep the published talent point allocations and client-linked talents intact. */
export function localizeWarriorTalentTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([html]) => html);
  if (tables.length !== 2 || labels?.length !== 2) {
    throw new Error("Warrior talent tables or translations missing");
  }
  return tables.map((table, index) => {
    const label = labels[index];
    let row = 0;
    const result = table.replace(/<th>([^<]+)<\/th>/g, (_, sourceHeader) => {
      const header = label.headers?.[sourceHeader];
      if (!header) throw new Error(`Missing Warrior talent header ${sourceHeader}`);
      return `<th>${header}</th>`;
    }).replace(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><\/tr>/g,
      (_, _build, talents) => {
        const build = label.builds?.[row];
        const reason = label.reasons?.[row];
        if (!build || !reason) throw new Error(`Missing Warrior talent row ${index}/${row}`);
        row += 1;
        return `<tr><td>${build}</td><td>${talents}</td><td>${reason}</td></tr>`;
      });
    if (row !== 3) throw new Error(`Expected 3 Warrior talent builds, found ${row}`);
    return result;
  });
}
