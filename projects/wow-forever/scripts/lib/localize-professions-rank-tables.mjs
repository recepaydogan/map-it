const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const professions = {
  Alchemy: 171, Blacksmithing: 164, Enchanting: 333, Engineering: 202,
  Leatherworking: 165, Tailoring: 197, Herbalism: 182, Mining: 186,
  Skinning: 393, Cooking: 185, "First Aid": 129, Fishing: 356,
};

/** Preserve rank caps and Classic trainer levels; source profession names come from client. */
export function localizeProfessionsRankTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  if (tables.length !== 2 || !labels?.headers || !labels?.ranks || !labels?.client) {
    throw new Error("Profession rank tables or labels missing");
  }
  const first = tables[0].replace(/<tr><td>(Apprentice|Journeyman|Expert|Artisan)<\/td><td>(\d+)<\/td><\/tr>/g,
    (_, rank, cap) => `<tr><td>${escapeHtml(labels.ranks[rank])}</td><td>${cap}</td></tr>`);
  if ([...first.matchAll(/<tr><td>/g)].length !== 4) {
    throw new Error("Expected four profession rank caps");
  }
  let rows = 0;
  const second = tables[1].replace(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, names, apprentice, journeyman, expert, artisan) => {
      rows += 1;
      const localizedNames = names.split(", ").map((name) => {
        if (!professions[name]) throw new Error(`Unknown profession rank row ${name}`);
        return `{{CLIENT:SkillLine:${professions[name]}:0|${name}}}`;
      }).join(", ");
      const cells = [apprentice, journeyman, expert, artisan].map((level) => level === "1 (client)"
        ? `1 (${escapeHtml(labels.client)})` : level);
      return `<tr><td>${localizedNames}</td>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    });
  if (rows !== 7) throw new Error(`Expected seven trainer-level rows, found ${rows}`);
  const translateHeaders = (table) => table.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing profession rank header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
  return [translateHeaders(first), translateHeaders(second)];
}
