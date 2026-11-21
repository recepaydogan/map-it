const anchorPattern = /<a\b[^>]*data-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g;
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep Classic trainer pins and localize their zone names from the client. */
export function localizeProfessionsTrainerLists(original, labels, source, locale, expectedCount = 3) {
  if (!labels?.alliance || !labels?.horde) {
    throw new Error("Gathering trainer labels missing");
  }
  const lists = [...original.matchAll(/<ul><li><b>Alliance trainers \(Classic data\):<\/b>[\s\S]*?<\/ul>/g)]
    .map(([list]) => list);
  if (lists.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} profession trainer lists, found ${lists.length}`);
  }
  const anchors = [...original.matchAll(anchorPattern)].map(([anchor]) => anchor);
  const areaNames = new Map();
  source.keys.forEach((key, index) => {
    if (key.startsWith("AreaTable:") && !areaNames.has(source.values[index]) && locale.values[index]) {
      areaNames.set(source.values[index], escapeHtml(locale.values[index]));
    }
  });
  return lists.map((list, listIndex) => {
    let translated = list.replace("Alliance trainers (Classic data):", escapeHtml(labels.alliance))
      .replace("Horde trainers (Classic data):", escapeHtml(labels.horde))
      .replace(/<\/a> \(([^)]+)\)/g, (_, zone) => {
        const localizedZone = areaNames.get(zone);
        if (!localizedZone) throw new Error(`Unknown gathering trainer zone ${zone}`);
        return `</a> (${localizedZone})`;
      }).replace(anchorPattern, (anchor) => {
        const index = anchors.indexOf(anchor);
        if (index < 0) throw new Error(`Unknown gathering trainer pin ${anchor}`);
        return `{{LINK:${index}}}`;
      });
    if (listIndex === 2 && labels.skinningNote) {
      const note = "Blizzard's September 24 notes confirm you can learn Skinning from Helene Peltskinner in Elwynn Forest in Forever.";
      if (!translated.includes(note)) throw new Error("Skinning trainer note missing");
      translated = translated.replace(note, escapeHtml(labels.skinningNote));
    }
    return translated;
  });
}

export const localizeProfessionsGatheringTrainers = localizeProfessionsTrainerLists;
