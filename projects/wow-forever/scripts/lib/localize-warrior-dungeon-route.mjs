/** Keep the Warrior dungeon route's exact links and client dungeon names. */
export function localizeWarriorDungeonRoute(original, template, source, locale) {
  const paragraph = original.match(/<p>Blizzard's 1 October notes list the dungeons[\s\S]*?<\/p>/)?.[0];
  if (!paragraph || !template) throw new Error("Warrior dungeon route or translation missing");
  const links = [...paragraph.matchAll(/<a\b[^>]*data-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g)]
    .map(([anchor]) => anchor);
  if (links.length !== 13) throw new Error(`Expected 13 Warrior dungeon links, found ${links.length}`);
  const expected = [...Array(10).keys(), "scarlet", 10, 11, 12].join(",");
  const found = [...template.matchAll(/\{(\d+|scarlet)\}/g)].map(([, token]) => token).join(",");
  if (found !== expected) throw new Error(`Warrior dungeon placeholders changed: ${found}`);
  const index = source.keys.findIndex((key, position) =>
    key.startsWith("LFGDungeons:") && source.values[position] === "Scarlet Monastery" && locale.values[position]);
  if (index < 0 || !paragraph.includes("Scarlet Monastery")) {
    throw new Error("Scarlet Monastery client name missing");
  }
  return `<p>${template.replace(/\{(\d+|scarlet)\}/g, (_, token) =>
    token === "scarlet" ? locale.values[index] : links[Number(token)])}</p>`;
}
