/** Retain Classic quest/NPC references and exact map links while translating guide prose. */
export function localizeWarriorQuestTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([html]) => html);
  if (tables.length !== 2 || labels?.length !== 2) {
    throw new Error("Warrior quest tables or translations missing");
  }
  return tables.map((table, index) => {
    const label = labels[index];
    let row = 0;
    const result = table.replace(/<th>([^<]+)<\/th>/g, (_, sourceHeader) => {
      const header = label.headers?.[sourceHeader];
      if (!header) throw new Error(`Missing Warrior quest header ${sourceHeader}`);
      return `<th>${header}</th>`;
    }).replace(/<tr>([\s\S]*?)<\/tr>/g, (full, inner) => {
      const cells = [...inner.matchAll(/<td>[\s\S]*?<\/td>/g)].map(([cell]) => cell);
      if (!cells.length) return full;
      const quest = label.quests?.[row];
      const faction = label.factions?.[cells.at(-1).slice(4, -5)];
      if (!quest || !faction) throw new Error(`Missing Warrior quest row ${index}/${row}`);
      cells[0] = `<td>${quest}</td>`;
      cells[cells.length - 1] = `<td>${faction}</td>`;
      row += 1;
      return `<tr>${cells.join("")}</tr>`;
    });
    if (row !== (index === 0 ? 5 : 9)) {
      throw new Error(`Expected ${index === 0 ? 5 : 9} Warrior quest rows, found ${row}`);
    }
    return result;
  });
}
