import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const raceIds = { Human: 1, Gnome: 7, Undead: 5, Troll: 8 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Keep Classic quest IDs, NPC/map pins, and rewards while translating their context. */
export function localizeMageQuestTable(original, labels, source, locale, language, questTitles) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || labels?.who?.length !== 9 ||
    !labels?.firstReward || !labels?.connectors || !questTitles || !language) {
    throw new Error("Mage quest table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const clientRace = (english) => {
    const index = indices.get(`ChrRaces:${raceIds[english]}:2`);
    if (index === undefined || source.values[index] !== english || !locale.values[index]) {
      throw new Error(`Missing client Mage quest race ${english}`);
    }
    return escapeHtml(locale.values[index]);
  };
  let rowIndex = 0;
  const translated = table.replace(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, level, quests, who, reward) => {
      const index = rowIndex++;
      if (!labels.who[index]) throw new Error(`Missing Mage quest location ${index}`);
      const questNames = quests.split(", ").map((part) => {
        const next = part.startsWith("then ");
        const [, name, qualifier] = (next ? part.slice(5) : part)
          .match(/^(.*?)(?: \((Human|Gnome|Undead|Troll|Alliance|Horde|28)\))?$/) ?? [];
        const record = questTitles[name];
        const translatedName = record?.[language] ?? (language === "es-MX" ? record?.es : undefined);
        if (!record?.questIds?.length || !translatedName) {
          throw new Error(`${language}: missing Mage quest title ${name}`);
        }
        const suffix = !qualifier ? "" : qualifier === "28" ? " (28)"
          : raceIds[qualifier] ? ` (${clientRace(qualifier)})`
            : ` (${escapeHtml(labels.factions[qualifier])})`;
        return `${next ? labels.connectors.then : ""}${escapeHtml(translatedName)}${suffix}`;
      }).join(quests.includes(", then ") ? labels.connectors.stepSeparator
        : labels.connectors.listSeparator);
      const location = localizeGuideSectionLinks(who, labels.who[index]);
      const rewardText = index === 0 ? escapeHtml(labels.firstReward)
        : reward.replaceAll(" or ", labels.connectors.or);
      return `<tr><td>${escapeHtml(level)}</td><td>${questNames}</td>` +
        `<td>${location}</td><td>${rewardText}</td></tr>`;
    });
  if (rowIndex !== 9 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Mage quest rows or links changed: ${rowIndex}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Mage quest header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
