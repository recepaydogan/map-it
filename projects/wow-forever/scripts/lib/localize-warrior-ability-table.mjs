/** Preserve the client's ability/level rows and localize their table labels. */
export function localizeWarriorAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.trainer || !labels?.classicQuest) {
    throw new Error("Warrior ability table or labels missing");
  }
  const rowCount = [...table.matchAll(/<tr><td>/g)].length;
  if (rowCount !== 53) throw new Error(`Expected 53 Warrior ability rows, found ${rowCount}`);
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels.headers[value]) throw new Error(`Missing ability header ${value}`);
    return `<th>${labels.headers[value]}</th>`;
  }).replace(/<td>(Rank (\d+)|Trainer|Quest: (?:Path of Defense|The Affray) \(Classic quest\))<\/td>/g,
    (_, value, rank) => {
      if (rank) return `<td>${labels.rank.replace("{rank}", rank)}</td>`;
      if (value === "Trainer") return `<td>${labels.trainer}</td>`;
      const questName = value.slice("Quest: ".length, -" (Classic quest)".length);
      return `<td>${labels.classicQuest.replace("{quest}", questName)}</td>`;
    });
  if (translated.includes("<td>Trainer</td>") || translated.includes("<td>Rank ") ||
    translated.includes("(Classic quest)</td>")) {
    throw new Error("Untranslated Warrior ability table cell");
  }
  return translated;
}

export function localizeWarriorAbilityNotesLinks(original, translated) {
  const notes = original.slice(original.indexOf("</table>") + "</table>".length);
  const links = [...notes.matchAll(/<a\b[^>]*data-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g)]
    .map(([anchor]) => anchor);
  const placeholders = [...translated.matchAll(/\{\{LINK:(\d+)\}\}/g)].map(([, index]) => Number(index));
  if (links.length !== 30 || JSON.stringify(placeholders) !==
    JSON.stringify([...Array(links.length).keys()])) {
    throw new Error("Warrior ability note links changed");
  }
  return translated.replace(/\{\{LINK:(\d+)\}\}/g, (_, index) => links[Number(index)]);
}

export function localizeGuideSectionLinks(original, translated) {
  const links = [...original.matchAll(/<a\b[^>]*data-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g)]
    .map(([anchor]) => anchor);
  const pattern = /\{\{LINK:(\d+)(?:\|([^}]+))?\}\}/g;
  const placeholders = [...translated.matchAll(pattern)].map(([, index]) => Number(index));
  if (JSON.stringify(placeholders) !== JSON.stringify([...Array(links.length).keys()])) {
    throw new Error(`Guide section link placeholders changed: expected ${links.length}`);
  }
  return translated.replace(pattern, (_, index, label) => {
    const anchor = links[Number(index)];
    if (!label) return anchor;
    const escaped = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return anchor.replace(/>[^<]*<\/a>$/, `>${escaped}</a>`);
  });
}

export function localizeGuideSectionLinksOutsideTables(original, translated) {
  return localizeGuideSectionLinks(original.replace(/<table>[\s\S]*?<\/table>/g, ""), translated);
}
