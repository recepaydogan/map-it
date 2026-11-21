export type SpellTextPart = { text: string } | { id: number; name: string };

// Explicit boundaries keep links intact next to CJK text and grammatical suffixes.
export function splitSpellTokens(text: string): SpellTextPart[] {
  const parts: SpellTextPart[] = [];
  let start = 0;
  for (const match of text.matchAll(/\[\[spell:([1-9]\d*)\|([^\]\r\n]+)\]\]/g)) {
    if (match.index > start) parts.push({ text: text.slice(start, match.index) });
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id)) {
      parts.push({ text: match[0] });
    } else parts.push({ id, name: match[2] });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}
