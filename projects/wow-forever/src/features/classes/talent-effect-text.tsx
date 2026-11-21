import { Fragment } from "react";

const effectPattern = /\b\d+(?:[.,]\d+)?\s*(?:Rage|Mana|Energy|Focus)\b|\b(?:Rage|Mana|Energy|Focus|Attack Power|Spell Power|Critical Strike|Critical Hit|Crit Chance|Hit Chance|Haste|Strength|Agility|Intellect|Stamina|Spirit|Armor)\b|\b\d+(?:[.,]\d+)?%(?!\d)/gi;

const effectColor = (value: string) => {
  if (/\bRage\b/i.test(value)) return "var(--color-danger-text)";
  if (/\bMana\b/i.test(value)) return "var(--color-grade-heroic)";
  if (/\bEnergy\b/i.test(value)) return "var(--gold-bright)";
  if (/\bFocus\b/i.test(value)) return "var(--color-grade-rare)";
  if (value.endsWith("%")) return "var(--gold-bright)";
  return "var(--color-grade-rare)";
};

/** Preserve the source wording while making resource, stat and percentage effects scannable. */
const TalentEffectText = ({ text }: { text: string }) => {
  const segments = [];
  let start = 0;
  for (const match of text.matchAll(effectPattern)) {
    const index = match.index;
    if (index > start) segments.push(<Fragment key={`text-${start}`}>{text.slice(start, index)}</Fragment>);
    segments.push(<span key={`effect-${index}`} className="font-medium" style={{ color: effectColor(match[0]) }}>{match[0]}</span>);
    start = index + match[0].length;
  }
  if (start < text.length) segments.push(<Fragment key={`text-${start}`}>{text.slice(start)}</Fragment>);
  return <>{segments}</>;
};

export default TalentEffectText;
