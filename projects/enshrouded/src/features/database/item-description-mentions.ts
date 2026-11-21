import type { DatabaseItem } from "./item-database-types";

export interface ItemDescriptionMention {
  start: number;
  end: number;
  items: DatabaseItem[];
}

const isWordCharacter = (character: string | undefined) => Boolean(character && /[\p{L}\p{N}]/u.test(character));

export const findItemDescriptionMentions = (text: string, itemsById: Map<string, DatabaseItem>): ItemDescriptionMention[] => {
  const itemsByName = new Map<string, DatabaseItem[]>();
  for (const item of itemsById.values()) {
    if (item.duplicateOf) continue;
    const matches = itemsByName.get(item.name) ?? [];
    matches.push(item);
    itemsByName.set(item.name, matches);
  }

  const mentions: ItemDescriptionMention[] = [];
  const candidates = [...itemsByName].filter(([name]) => name && text.includes(name))
    .sort(([left], [right]) => right.length - left.length);
  for (const [name, items] of candidates) {
    let start = text.indexOf(name);
    while (start !== -1) {
      const end = start + name.length;
      if (!isWordCharacter(text[start - 1]) && !isWordCharacter(text[end])
        && !mentions.some((mention) => start < mention.end && end > mention.start)) {
        mentions.push({ start, end, items });
      }
      start = text.indexOf(name, end);
    }
  }
  return mentions.sort((left, right) => left.start - right.start);
};
