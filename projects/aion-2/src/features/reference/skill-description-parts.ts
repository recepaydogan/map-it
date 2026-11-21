import en from "../../i18n/locales/en.json" with { type: "json" };

const statWords = /\b(?:HP|MP|Stamina|Damage|Attack|Defense|Accuracy|Evasion|Block|Critical|Chance|Speed|Heal|Recovery|Regen|Penetration|Resist|Tolerance|Endurance|Regeneration)\b/i;
const statNames = new Set([
  ...Object.values(en.reference.labels)
    .map((name) => name.replace(/\s*\(%\)$/, ""))
    .filter((name) => statWords.test(name)),
  "PvE Damage", "PvP Damage", "Max Stamina", "Skill Speed", "Stagger Gauge Damage",
  "Precision", "Might", "Dexterity", "Constitution", "Healing", "Heal", "Damage",
  "Attack", "Defense", "Accuracy", "Evasion", "Block", "Chance", "HP", "MP",
]);
const stat = new RegExp(`\\b(?:${[...statNames].sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
const token = new RegExp(`${stat.source}|\\b\\d[\\d,]*(?:\\.\\d+)?(?:[–-]\\d[\\d,]*(?:\\.\\d+)?)?%?`, "gi");

const statColor = (name: string) => {
  if (/^PvE\b/i.test(name)) return "text-cyan-300";
  if (/^PvP\b/i.test(name)) return "text-violet-300";
  if (/\b(?:HP|Heal|Healing)\b/i.test(name)) return "text-emerald-300";
  if (/\b(?:Critical|Perfect|Chance)\b/i.test(name)) return "text-amber-300";
  if (/\b(?:Speed|Stamina)\b/i.test(name)) return "text-lime-300";
  if (/\b(?:Tolerance|Defense|Accuracy|Evasion|Block|MP)\b/i.test(name)) return "text-sky-300";
  return "text-rose-300";
};

export const skillDescriptionParts = (text: string): { text: string; color?: string }[] => {
  const stats = [...text.matchAll(stat)];
  const boundaries = [...text.matchAll(/[,;!?\n]|\.(?!\d)|\band\b/gi)];
  const parts: { text: string; color?: string }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(token)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    let color = /^[0-9]/.test(match[0]) ? "" : statColor(match[0]);
    if (/^[0-9]/.test(match[0]) && !/^\s*(?:m|s)\b/i.test(text.slice(end))) {
      const clauseStart = boundaries.filter((entry) => entry.index + entry[0].length <= start)
        .at(-1)?.index ?? -1;
      const clauseEnd = boundaries.find((entry) => entry.index >= end)?.index ?? text.length;
      const nearest = stats.filter((entry) => entry.index > clauseStart && entry.index < clauseEnd)
        .map((entry) => ({ name: entry[0], distance: Math.min(
        Math.abs(entry.index - end), Math.abs(start - (entry.index + entry[0].length)),
        ) })).sort((a, b) => a.distance - b.distance)[0];
      if (nearest && nearest.distance <= 22) color = statColor(nearest.name);
      else if (match[0].endsWith("%")) color = "text-amber-300";
    }
    parts.push(color ? { text: match[0], color } : { text: match[0] });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
};
