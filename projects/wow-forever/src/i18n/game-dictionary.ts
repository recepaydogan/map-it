export interface PackedValues {
  version: number;
  values: (string | null)[];
}

export interface PackedSource extends PackedValues {
  keys: string[];
}

export interface GameDictionary {
  sourceByKey: Map<string, string>;
  byKey: Map<string, string>;
  byEnglish: Map<string, string>;
}

/** Exact catalog and client names reviewed for the same item identity. */
export const REVIEWED_ITEM_NAME_ALIASES: Record<string, { catalog: string; client: string }> = {
  "ItemSparse:258771:4": { catalog: "Al'Alketh Cultist's Ear", client: "Al'Aketh Cultist's Ear" },
  "ItemSparse:273310:4": { catalog: "Alchemey Ward - Fel Ash Experimentation Notes", client: "Alchemy Ward - Fel Ash Experimentation Notes" },
  "ItemSparse:13503:4": { catalog: "Alchemists' Stone", client: "Alchemist's Stone" },
  "ItemSparse:277179:4": { catalog: "Amethrax Shard", client: "Corrupted Amethrax Shard" },
  "ItemSparse:273115:4": { catalog: "Blueprint: Baker's Oven", client: "Blueprint: Iron Oven" },
  "ItemSparse:276088:4": { catalog: "Bracket", client: "Metal Bracket" },
  "ItemSparse:277128:4": { catalog: "Bloodtalon Martriarch Eggs", client: "Bloodtalon Matriarch Eggs" },
  "ItemSparse:252554:4": { catalog: "Blue Suede Shoulder", client: "Blue Suede Shoulders" },
  "ItemSparse:252583:4": { catalog: "Charged Scorpid Shoulder", client: "Charged Scorpid Shoulders" },
  "ItemSparse:276158:4": { catalog: "Crystalized Shard", client: "Crystallized Shard" },
  "ItemSparse:272025:4": { catalog: "Dathrohan's Correspondance", client: "Dathrohan's Correspondence" },
  "ItemSparse:2315:4": { catalog: "Dark Leather Boots", client: "Gray Leather Boots" },
  "ItemSparse:277174:4": { catalog: "Dreadspinner Shard", client: "Corrupted Dreadspinner Shard" },
  "ItemSparse:277178:4": { catalog: "Sorrowful Shard", client: "Corrupted Sorrowful Shard" },
  "ItemSparse:277175:4": { catalog: "Tangleclaw Shard", client: "Corrupted Tangleclaw Shard" },
  "ItemSparse:251485:4": { catalog: "Edwards' Knife", client: "Edward's Knife" },
  "ItemSparse:277533:4": { catalog: "Fel Tained Journal", client: "Fel Tainted Journal" },
  "ItemSparse:277222:4": { catalog: "Feathered Cuffs", client: "War Painted Cuffs" },
  "ItemSparse:274392:4": { catalog: "Formula: Enchant Off-Hand - Excellent Spirit", client: "Formula: Enchant Off Hand - Excellent Spirit" },
  "ItemSparse:274391:4": { catalog: "Formula: Enchant Off-Hand - Superior Intellect", client: "Formula: Enchant Off Hand - Superior Intellect" },
  "ItemSparse:274393:4": { catalog: "Formula: Enchant Off-Hand - Wisdom", client: "Formula: Enchant Off Hand - Wisdom" },
  "ItemSparse:8547:4": { catalog: "Formula: Powerful Smelling Salts", client: "Formula: Powerful Smelling Salts " },
  "ItemSparse:275736:4": { catalog: "Horn of Ve'ho", client: "Horn of Ve'han" },
  "ItemSparse:275737:4": { catalog: "Horned Pauldron", client: "Hermit's Pauldron" },
  "ItemSparse:275738:4": { catalog: "Jereman Band", client: "Jereman's Bauble" },
  "ItemSparse:274373:4": { catalog: "Leather-bound Flask", client: "Barkskin Purification Tonic" },
  "ItemSparse:280797:4": { catalog: "Rabbit Crate (Artic)", client: "Rabbit Crate (Arctic)" },
  "ItemSparse:280839:4": { catalog: "Stolen Supplies", client: "Blackrock Supplies" },
  "ItemSparse:254696:4": { catalog: "Reverance", client: "Reverence" },
  "ItemSparse:251320:4": { catalog: "Satchet of Spirit Powder", client: "Sachet of Spirit Powder" },
  "ItemSparse:274749:4": { catalog: "Souvenier Sea Shell", client: "Souvenir Sea Shell" },
  "ItemSparse:255645:4": { catalog: "Swolen Venom Sac", client: "Swollen Venom Sac" },
  "ItemSparse:263411:4": { catalog: "Windcharged Leaf", client: "Idol of Shifting Tides" },
  "ItemSparse:9224:4": { catalog: "Potion of Demonslaying", client: "Potion of Demon Slaying" },
  "ItemSparse:250955:4": { catalog: "Potion of Beast Culling", client: "Potion of Beast Slaying" },
  "ItemSparse:250954:4": { catalog: "Potion of Elemental Siphoning", client: "Potion of Elemental Purging" },
  "ItemSparse:9300:4": { catalog: "Recipe: Potion of Demonslaying", client: "Recipe: Potion of Demon Slaying" },
  "ItemSparse:13517:4": { catalog: "Recipe: Alchemists' Stone", client: "Recipe: Alchemist's Stone" },
  "ItemSparse:250999:4": { catalog: "Recipe: Potion of Beast Culling", client: "Recipe: Potion of Beast Slaying" },
  "ItemSparse:250998:4": { catalog: "Recipe: Potion of Elemental Siphoning", client: "Recipe: Potion of Elemental Purging" },
  "ItemSparse:250327:4": { catalog: "Draught of Predatory Senses", client: "Potion of Predatory Senses" },
  "ItemSparse:250363:4": { catalog: "Recipe: Draught of Predatory Senses", client: "Recipe: Potion of Predatory Senses" },
  "ItemSparse:252538:4": { catalog: "Mender's Leather Shoulder", client: "Mender's Leather Shoulders" },
  "ItemSparse:252569:4": { catalog: "Mender's Mail Shoulder", client: "Mender's Mail Shoulders" },
  "ItemSparse:277215:4": { catalog: "Nimble Gloves", client: "Plain Handwraps" },
  "ItemSparse:252881:4": { catalog: "Pattern: Blue Suede Shoulder", client: "Pattern: Blue Suede Shoulders" },
  "ItemSparse:252917:4": { catalog: "Pattern: Charged Scorpid Shoulder", client: "Pattern: Charged Scorpid Shoulders" },
  "ItemSparse:252852:4": { catalog: "Pattern: Mender's Leather Shoulder", client: "Pattern: Mender's Leather Shoulders" },
  "ItemSparse:252903:4": { catalog: "Pattern: Mender's Mail Shoulder", client: "Pattern: Mender's Mail Shoulders" },
  "ItemSparse:252848:4": { catalog: "Pattern: Prowler's Leather Shoulder", client: "Pattern: Prowler's Leather Shoulders" },
  "ItemSparse:252902:4": { catalog: "Pattern: Skirmisher's Mail Shoulder", client: "Pattern: Skirmisher's Mail Shoulders" },
  "ItemSparse:252851:4": { catalog: "Pattern: Skycaller's Leather Shoulder", client: "Pattern: Skycaller's Leather Shoulders" },
  "ItemSparse:252901:4": { catalog: "Pattern: Skycaller's Mail Shoulder", client: "Pattern: Skycaller's Mail Shoulders" },
  "ItemSparse:252900:4": { catalog: "Pattern: Stalker's Mail Shoulder", client: "Pattern: Stalker's Mail Shoulders" },
  "ItemSparse:252926:4": { catalog: "Pattern: Supple Scorpid Shoulder", client: "Pattern: Supple Scorpid Shoulders" },
  "ItemSparse:252850:4": { catalog: "Pattern: Warden's Leather Shoulder", client: "Pattern: Warden's Leather Shoulders" },
  "ItemSparse:252884:4": { catalog: "Pattern: Wicked Leather Shoulder", client: "Pattern: Wicked Leather Shoulders" },
  "ItemSparse:252534:4": { catalog: "Prowler's Leather Shoulder", client: "Prowler's Leather Shoulders" },
  "ItemSparse:252568:4": { catalog: "Skirmisher's Mail Shoulder", client: "Skirmisher's Mail Shoulders" },
  "ItemSparse:252537:4": { catalog: "Skycaller's Leather Shoulder", client: "Skycaller's Leather Shoulders" },
  "ItemSparse:252567:4": { catalog: "Skycaller's Mail Shoulder", client: "Skycaller's Mail Shoulders" },
  "ItemSparse:252566:4": { catalog: "Stalker's Mail Shoulder", client: "Stalker's Mail Shoulders" },
  "ItemSparse:252592:4": { catalog: "Supple Scorpid Shoulder", client: "Supple Scorpid Shoulders" },
  "ItemSparse:252536:4": { catalog: "Warden's Leather Shoulder", client: "Warden's Leather Shoulders" },
  "ItemSparse:263412:4": { catalog: "Windcarved Effigy", client: "Totem of Charged Flames" },
  "ItemSparse:252556:4": { catalog: "Wicked Leather Shoulder", client: "Wicked Leather Shoulders" },
  "ItemSparse:277172:4": { catalog: "Yeti Shard", client: "Corrupted Chillhowl Shard" },
};

/** Item descriptions reviewed as identical after case, spacing, or punctuation changes. */
export const REVIEWED_ITEM_DESCRIPTION_FORMAT_IDS = new Set([
  "286266", "286281", "286308", "273659", "271898", "250725", "271771", "286328",
  "286310", "228979", "215141", "271770", "286268", "250744", "258526", "247684",
  "249534", "249536", "249535", "274392", "274391", "274393", "215129", "9061",
  "254780", "9060", "274373", "258530", "286316", "271912", "215367", "215368",
  "9300", "286327", "264218", "260236", "253258", "286294", "254859", "286302",
]);

export const normalizeReviewedItemDescription = (text: string): string =>
  text.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}$]+/gu, "");

/** Keep client keys intact and prefer their localized display fields. */
export function createGameDictionary(source: PackedSource, translated: PackedValues): GameDictionary {
  if (translated.version !== 1 || !Array.isArray(translated.values) ||
    translated.values.length !== source.keys.length) {
    throw new Error("Invalid game locale translation");
  }
  const byKey = new Map<string, string>();
  const sourceByKey = new Map<string, string>();
  const byEnglish = new Map<string, string>();
  const conflicts = new Set<string>();
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    const english = source.values[index];
    const value = translated.values[index];
    if (english) sourceByKey.set(key, english);
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
  return { sourceByKey, byKey, byEnglish };
}

export function getKeyedGameText(
  dictionary: GameDictionary | undefined,
  english: string,
  key: string | undefined,
): string | undefined {
  if (!key || !dictionary) return undefined;
  const source = dictionary.sourceByKey.get(key);
  const alias = REVIEWED_ITEM_NAME_ALIASES[key];
  const sameWhitespaceNormalizedText = source && english &&
    source.replace(/\s+/g, " ").trim() === english.replace(/\s+/g, " ").trim();
  const reviewedDescription = source && /^ItemSparse:(\d+):0$/.exec(key)?.[1];
  const sameReviewedDescription = reviewedDescription &&
    REVIEWED_ITEM_DESCRIPTION_FORMAT_IDS.has(reviewedDescription) &&
    normalizeReviewedItemDescription(source) === normalizeReviewedItemDescription(english);
  return sameWhitespaceNormalizedText || sameReviewedDescription ||
    (alias?.catalog === english && alias.client === source)
    ? dictionary.byKey.get(key) : undefined;
}
