import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const professions = {
  Cooking: 185, Alchemy: 171, Blacksmithing: 164, Enchanting: 333,
  Engineering: 202, Herbalism: 182, Leatherworking: 165, Mining: 186,
  Skinning: 393, Tailoring: 197, "First Aid": 129, Fishing: 356,
};
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep the client's 12 profession rows, camp items, skill gates, and link order. */
export function localizeProfessionsCampingTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rows) throw new Error("Camping table or labels missing");
  const rows = [...table.matchAll(/<tr><td>([^<]+)<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/g)]
    .map(([, name]) => name);
  if (rows.length !== 12 || rows.some((name) => !professions[name] || !labels.rows[name])) {
    throw new Error("Expected 12 localized camping rows");
  }
  const headers = ["Profession", "At skill 20", "At skill 140"];
  const translated = `<table><thead><tr>${headers.map((header) =>
    `<th>${escapeHtml(labels.headers[header])}</th>`).join("")}</tr></thead><tbody>${rows.map((name) => {
    const cells = labels.rows[name];
    if (!Array.isArray(cells) || cells.length !== 2) throw new Error(`Missing camping cells for ${name}`);
    return `<tr><td>{{CLIENT:SkillLine:${professions[name]}:0|${name}}}</td>` +
      cells.map((cell) => `<td>${cell}</td>`).join("") + "</tr>";
  }).join("")}</tbody></table>`;
  return localizeGuideSectionLinks(table, translated);
}
