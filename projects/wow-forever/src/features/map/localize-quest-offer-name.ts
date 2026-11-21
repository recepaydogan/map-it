/** Preserve the map's dungeon qualifier while translating the ID-backed quest title. */
export function localizeQuestOfferName(
  name: string,
  questId: string,
  gameText: (english: string, key?: string) => string,
) {
  const direct = gameText(name, `Quest:${questId}:0`);
  if (direct !== name) return direct;
  const qualified = /^(.*) \(([^()]*)\)$/.exec(name);
  if (!qualified) return name;
  const title = gameText(qualified[1], `Quest:${questId}:0`);
  const location = gameText(qualified[2]);
  return title !== qualified[1] || location !== qualified[2]
    ? `${title} (${location})` : name;
}
