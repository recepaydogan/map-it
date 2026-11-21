/** Decode the installed 1.60.1.69977 ItemSparse layout (6FCC3191). */
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const fields = [
  ["expansionId", "u32"], ["damageVariance", "f32"], ["limitCategory", "u32"],
  ["durationInInventory", "u32"], ["qualityModifier", "f32"], ["bagFamily", "u32"],
  ["startQuestId", "u32"], ["languageId", "u32"], ["itemRange", "f32"],
  ["statPercentageOfSocket", "f32", 10], ["statPercentEditor", "i32", 10],
  ["statModifierBonusStat", "i32", 10], ["stackable", "i32"], ["maxCount", "i32"],
  ["minReputation", "i32"], ["requiredAbility", "u32"], ["allowableRace", "i32", 2],
  ["sellPrice", "u32"], ["buyPrice", "u32"], ["vendorStackCount", "u32"],
  ["priceVariance", "f32"], ["priceRandomValue", "f32"], ["flags", "u32", 5],
  ["oppositeFactionItemId", "u32"], ["modifiedCraftingReagentItemId", "u32"],
  ["contentTuningId", "u32"], ["playerLevelToItemLevelCurveId", "u32"],
  ["itemLevelOffsetCurveId", "u32"], ["itemLevelOffsetItemLevel", "u32"],
  ["itemSquishEraId", "u32"], ["itemNameDescriptionId", "u16"],
  ["requiredTransmogHoliday", "u16"], ["requiredHoliday", "u16"],
  ["gemProperties", "u16"], ["socketMatchEnchantmentId", "u16"],
  ["totemCategoryId", "u16"], ["instanceBound", "u16"], ["zoneBound", "u16", 2],
  ["itemSetId", "u16"], ["lockId", "u16"], ["pageId", "u16"],
  ["itemDelay", "u16"], ["minFactionId", "u16"], ["requiredSkillRank", "u16"],
  ["requiredSkill", "u16"], ["itemLevel", "u16"], ["allowableClass", "i16"],
  ["artifactId", "u8"], ["spellWeight", "u8"], ["spellWeightCategory", "u8"],
  ["socketType", "u8", 3], ["sheatheType", "u8"], ["material", "u8"],
  ["pageMaterialId", "u8"], ["bonding", "u8"], ["damageType", "u8"],
  ["containerSlots", "u8"], ["requiredPvpMedal", "u8"], ["requiredPvpRank", "i8"],
  ["requiredLevel", "i8"], ["inventoryType", "i8"], ["qualityCode", "u8"],
  ["ammunitionType", "u8"],
];

const readers = {
  u8: [1, (data, offset) => data.readUInt8(offset)],
  i8: [1, (data, offset) => data.readInt8(offset)],
  u16: [2, (data, offset) => data.readUInt16LE(offset)],
  i16: [2, (data, offset) => data.readInt16LE(offset)],
  u32: [4, (data, offset) => data.readUInt32LE(offset)],
  i32: [4, (data, offset) => data.readInt32LE(offset)],
  f32: [4, (data, offset) => data.readFloatLE(offset)],
};

export const decodeClientItemSparse = (data) => {
  let offset = 0;
  const strings = [];
  for (let index = 0; index < 5; index += 1) {
    const end = data.indexOf(0, offset);
    if (end < 0) throw new Error("ItemSparse row has an unterminated string");
    strings.push(textDecoder.decode(data.subarray(offset, end)));
    offset = end + 1;
  }
  const result = { description: strings[0], display3: strings[1], display2: strings[2],
    display1: strings[3], name: strings[4] };
  for (const [name, type, count = 1] of fields) {
    const [size, read] = readers[type];
    if (offset + size * count > data.length) throw new Error(`ItemSparse row ends inside ${name}`);
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(read(data, offset));
      offset += size;
    }
    result[name] = count === 1 ? values[0] : values;
  }
  const padding = data.length - offset;
  if (padding < 0 || padding > 3 || data.subarray(offset).some((byte) => byte !== 0)) {
    throw new Error(`Unexpected ItemSparse row padding: ${padding} bytes`);
  }
  return result;
};
