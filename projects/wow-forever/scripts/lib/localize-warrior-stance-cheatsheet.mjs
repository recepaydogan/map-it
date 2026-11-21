/** Rebuild the stance reference with the installed client's spell names. */
const spellIds = {
  "Battle Stance": 2457, Charge: 100, Overpower: 7384, "Mocking Blow": 694,
  Retaliation: 20230, "Sweeping Strikes": 12292, "Defensive Stance": 71,
  Taunt: 355, Revenge: 6572, "Shield Block": 2565, Disarm: 676,
  "Shield Wall": 871, "Berserker Stance": 2458, Intercept: 20252,
  "Berserker Rage": 18499, Rend: 772, "Thunder Clap": 6343,
  "Shield Bash": 72, Hamstring: 1715, Execute: 5308,
  "Heroic Strike": 78, Cleave: 845, Slam: 1464,
  "Sunder Armor": 7386, Bloodrage: 2687, "Tactical Mastery": 1310185,
};
const groups = [
  ["battle", "Battle Stance", ["Charge", "Overpower", "Mocking Blow", "Retaliation", "Sweeping Strikes"]],
  ["defensive", "Defensive Stance", ["Taunt", "Revenge", "Shield Block", "Disarm", "Shield Wall"]],
  ["berserker", "Berserker Stance", ["Intercept", "Berserker Rage"]],
  ["battleOrDefensive", null, ["Rend", "Thunder Clap", "Shield Bash"]],
  ["battleOrBerserker", null, ["Hamstring", "Execute"]],
  ["any", null, ["Heroic Strike", "Cleave", "Slam", "Sunder Armor", "Bloodrage"]],
];
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeWarriorStanceCheatsheet(original, labels, source, locale) {
  const paragraph = original.match(/<p>The Forever client lists which stance[\s\S]*?<\/p>/)?.[0];
  if (!paragraph || !labels?.intro || !labels?.outro || !labels?.shouts || !labels?.and ||
    groups.some(([key]) => !labels[key])) throw new Error("Warrior stance reference or labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const spell = (english) => {
    if (!paragraph.includes(english)) throw new Error(`Missing source stance spell ${english}`);
    const index = indices.get(`SpellName:${spellIds[english]}:0`);
    if (index === undefined || source.values[index] !== english || !locale.values[index]) {
      throw new Error(`Missing client stance spell ${english}`);
    }
    return escapeHtml(locale.values[index]);
  };
  const list = (names) => names.map(spell).join(labels.separator ?? ", ");
  const sentences = groups.map(([key, stance, names]) => {
    const title = stance ? spell(stance) : labels[key];
    const prefix = stance ? `<b>${title}</b>` : title;
    const value = key === "any" ? `${list(names)}${labels.and}${labels.shouts}` : list(names);
    return `${prefix}: ${value}.`;
  });
  spell("Tactical Mastery");
  return `<p>${labels.intro} ${sentences.join(" ")} ${labels.outro.replace("{talent}",
    spell("Tactical Mastery"))}</p>`;
}
