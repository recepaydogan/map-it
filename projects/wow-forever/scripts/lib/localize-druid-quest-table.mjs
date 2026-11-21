import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Retain Classic quest/NPC names and map pins; client-sourced names resolve in prose. */
export function localizeDruidQuestTable(original, labels, source, locale, questNames) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.who || !labels?.rewards ||
    !labels?.firstQuest || !labels?.questSeparator || !questNames?.or || !questNames?.names) {
    throw new Error("Druid quest table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const clientName = (key, expected) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== expected || !locale.values[index]) {
      throw new Error(`Missing Druid quest client term ${expected}`);
    }
    return escapeHtml(locale.values[index]);
  };
  const race = (id, expected) => clientName(`ChrRaces:${id}:2`, expected);
  const questName = (name) => {
    if (name === "Moonglade") return clientName("AreaTable:493:1", name);
    if (name === "Aquatic Form") return clientName("SpellName:1066:0", name);
    if (!questNames.names[name]) throw new Error(`Missing Druid quest title ${name}`);
    return escapeHtml(questNames.names[name]);
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>(\d+)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, level, quests, who, reward) => {
      const position = rows++;
      if (!labels.who[position] || !labels.rewards[position]) {
        throw new Error(`Missing Druid quest row ${position}`);
      }
      const localizedQuests = position === 0
        ? labels.firstQuest.replace("{nightElf}", race(4, "Night Elf"))
          .replace("{tauren}", race(6, "Tauren"))
        : quests.split(", ").map((group) => group.split(" or ").map(questName)
          .join(labels.questSeparator === "、" ? escapeHtml(questNames.or)
            : ` ${escapeHtml(questNames.or)} `)).join(escapeHtml(labels.questSeparator));
      return `<tr><td>${level}</td><td>${localizedQuests}</td>` +
        `<td>${localizeGuideSectionLinks(who, labels.who[position])}</td>` +
        `<td>${localizeGuideSectionLinks(reward, labels.rewards[position])}</td></tr>`;
    });
  if (rows !== 4) throw new Error(`Expected four Druid quest rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Druid table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
