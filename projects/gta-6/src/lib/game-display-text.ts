/** Presentation only. Source records and identifiers remain unchanged. */
const smallWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
const preservedWords = new Set(["HP", "MP", "XP", "NPC", "UI", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
export const formatGameName = (value: string): string => value.split(/(\s*[·/]\s*)/).map(part => {
  if (!/\p{L}/u.test(part) || part !== part.toLocaleUpperCase("en")) return part;
  let index = 0;
  return part.toLocaleLowerCase("en").replace(/\p{L}[\p{L}\p{M}'’]*/gu, word => {
    const first = index++ === 0;
    if (preservedWords.has(word.toUpperCase())) return word.toUpperCase();
    return !first && smallWords.has(word) ? word : word[0]!.toLocaleUpperCase("en") + word.slice(1);
  });
}).join("");

/** A code is not a revealed game name. Never turn blueprint IDs into invented names. */
export const isInternalGameName = (value: string): boolean =>
  /^(?:\/Game\/|\/Script\/|\/PBZ|(?:BP|DT|DA|GE|GA|GC|AC|TU|CH|F|T|SK|SM|WBP|BrowLashCard|Body|Groom|Weapon_Material|Medi_Material|Bell|IA)_[A-Za-z0-9_]+$)/.test(value)
  || /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(value)
  || /^[A-Za-z]{1,6}_\d+(?:_\d+)*$/.test(value)
  || /^(?:None|Default__.+|[a-f\d]{24,})$/i.test(value);
