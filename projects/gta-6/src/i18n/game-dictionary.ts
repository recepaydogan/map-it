export interface PackedValues {
  version: number;
  values: (string | null)[];
}

export interface PackedSource extends PackedValues {
  keys: string[];
  aliases?: Record<string, string>;
  composites?: Record<string, { keys: string[]; english: string; separator: string }>;
}

export interface GameDictionary {
  byKey: Map<string, string>;
  byEnglish: Map<string, string>;
}

/** Keep client keys intact and prefer their localized display fields. */
export function createGameDictionary(source: PackedSource, translated: PackedValues): GameDictionary {
  if (translated.version !== 1 || !Array.isArray(translated.values) ||
    translated.values.length !== source.keys.length) {
    throw new Error("Invalid game locale translation");
  }
  const byKey = new Map<string, string>();
  const byEnglish = new Map<string, string>();
  const conflicts = new Set<string>();
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    const english = source.values[index];
    const value = translated.values[index];
    if (!value) continue;
    const [table, , field] = key.split(":");
    const display = table === "AreaTable" && field === "1" && english &&
      value.endsWith(` (${english})`)
      ? value.slice(0, -english.length - 3) : value;
    byKey.set(key, display);
    if (!english || conflicts.has(english)) continue;
    if (table === "AreaTable" && field !== "1") continue;
    if (table === "ChrRaces" && field !== "2") continue;
    const existing = byEnglish.get(english);
    if (existing !== undefined && existing !== display) {
      byEnglish.delete(english);
      conflicts.add(english);
    } else {
      byEnglish.set(english, display);
    }
  }

  // The client AreaTable name stays English for this city, but its WMO name
  // supplies the translated display name in German and French.
  const areaIndex = source.keys.indexOf("AreaTable:1638:1");
  const wmoIndex = source.keys.indexOf("WMOAreaTable:89812:0");
  if (areaIndex >= 0 && wmoIndex >= 0 &&
    source.values[areaIndex] === "Thunder Bluff" &&
    source.values[wmoIndex] === "Thunder Bluff" &&
    translated.values[areaIndex] === "Thunder Bluff") {
    const alternate = translated.values[wmoIndex];
    if (alternate && alternate !== "Thunder Bluff") {
      byKey.set("AreaTable:1638:1", alternate);
      byEnglish.set("Thunder Bluff", alternate);
    }
  }
  return { byKey, byEnglish };
}
