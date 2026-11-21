import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createItemEffectDictionary } from "./item-effect-text.ts";

const read = async (locale) => JSON.parse(await readFile(new URL(
  `../../public/data/locales/wow-forever/item-effects-${locale}.json`, import.meta.url), "utf8"));

test("reviewed item effects resolve in all eight game locales", async () => {
  const english = "Deputize a party member, sharing this quest with them so they can complete it with you.";
  const food = "Restores 17 health over 18 sec. Must remain seated while eating.";
  const drink = "Restores 249 mana over 27 sec. Must remain seated while drinking.";
  const wellFed = "Restores 358 health over 30 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 28 Spell Damage for 15 min.";
  const dualStatFood = "Restores 17 health over 18 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 2 Stamina and Spirit for 15 min.";
  const largeDualStatFoods = ["Agility", "Strength"].map((stat) =>
    `Restores 425 health over 30 sec. Must remain seated while eating. If you spend at least 10 sec eating you will become Well Fed and gain 25 ${stat} and 10 Stamina for 15 min.`);
  const specialWellFedFoods = [
    "Restores 358 health over 30 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 1% Critical Strike chance for 15 min.",
    "Restores 358 health over 30 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 15% movement speed while in Hyjal for 15 min.",
    "Restores 58 health over 21 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 15% movement speed while in Westfall for 15 min.",
  ];
  const manaWellFed = "Restores 249 mana over 27 sec. Must remain seated while drinking. If you spend at least 10 seconds eating you will become well fed and gain 10 Spirit for 15 min.";
  const fishingWellFed = "Restores 115 health over 24 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain 8 Fishing Skill for 15 min.";
  const teaching = "Teaches Faerie Fire (Rank 3).";
  const healingStreamTeaching = "Teaches Healing Stream Totem (Rank 1).";
  const stoneskinTeaching = "Teaches Stoneskin Totem (Rank 1).";
  const shortEffects = ["NYI.", "Restores mana.", "Teleport forward 20 yds.",
    "It's so good, you'll glow.", "Shoots a flare into the air.",
    "Raise a toast to your friend!", "Underwater breath lasts 100% longer than normal.",
    "Transforms target party memeber into a dancer!", "Increased Polearms +1.",
    "Improves your chance to hit by 2.0%.",
    "Increases your chance to Parry an attack by 1.0%.",
    "Movement speed increased by 2% in Duskwood.",
    "Movement speed increased by 2% in Silverpine Forest and Hillsbrad Foothills.",
    "Movement speed Increased by 2% in Tirisfal Glades, Silverpine Forest, and Shadowfang Keep.",
    "Movement speed Increased by 2% in Elwynn Forest, Westfall, Redridge Mountains, and the Deadmines.",
    "Returns you to Stormwind. . Single-use.",
    "Temporarily gives user an enchantment disguising them as their target.",
    "Attune yourself to Blackwing Lair!",
    "Sear certain enchanted targets with blazing light causing it to take additional damage from holy attacks and spells"];
  const cooldownEffects = [
    ["Reduces the cooldown of your Tiger's Fury ability by 3 sec.", "SpellName:5217:0"],
    ["Reduces the cooldown on your Swiftmend spell by 3 sec.", "SpellName:18562:0"],
    ["Reduces the cooldown of Counterspell by 2 sec.", "SpellName:2139:0"],
    ["Decreases the cooldown of Feign Death by 2 sec.", "SpellName:5384:0"],
    ["Reduces the cooldown of your Fade ability by 2 sec.", "SpellName:586:0"],
    ["Decreases the cooldown of Kick by 0.5 sec.", "SpellName:1766:0"],
  ];
  const abilityModifierEffects = [
    ["Increases the duration of Hammer of Justice by 0.5 sec.", "SpellName:853:0"],
    ["Reduces the mana cost of Lightning Bolt by 5 mana.", "SpellName:403:0"],
    ["Reduces the cost of your Hamstring ability by 2 rage points.", "SpellName:1715:0"],
  ];
  const shamanSpirits = "Allows the shaman to see elemental spirits.";
  const linkedHolyEffect = "Deals 13 to 15 Holy damage every time you block.";
  const crateBundle = "Fill the crate with any bundle from the following list:\n- 20 Strange Dust\n- 4 Greater Magic Essence\n- 6 Small Glimmering Shard\n- 2 Large Glimmering Shard";
  const tradeskillSign = "Add this profession's sign to your Dwarven Tradeskill Sign. toy for all characters on your account.\n\nCharacters that wish to display this sign must have that profession.";
  const numericEffects = [
    ["Increases your effective stealth detection level by 2.", ["2"]],
    ["Increases ranged attack speed by 15%.", ["15%"]],
    ["Restores 80 to 240 mana.", ["80", "240"]],
    ["Instantly restores 960 life.", ["960"]],
    ["Restores 700 to 900 health.", ["700", "900"]],
    ["Heals 2000 damage over 8 sec.", ["2000", "8"]],
    ["Inflicts 85 to 115 Fire damage and stuns targets in a 5 yard radius for 2 sec. Any damage will break the effect.", ["85", "115", "5", "2"]],
    ["Inflicts 51 to 69 Fire damage in a 5 yard radius.", ["51", "69", "5"]],
    ["Inflicts 183 to 247 Frost damage in a 5 yard radius.", ["183", "247", "5"]],
    ["Poisons target for 14 Nature damage every 3 sec for 9 sec.", ["14", "3", "9"]],
    ["Sends a shadowy bolt at the enemy causing 35 Shadow damage.", ["35"]],
    ["Sends a shadowy bolt at the enemy causing 110 to 140 Shadow damage.", ["110", "140"]],
    ["Absorbs 554 to 678 physical damage. Lasts 15 sec.", ["554", "678", "15"]],
    ["Restores 735 health and 735 mana over 30 sec. Must remain seated while eating.", ["735", "30"]],
    ["Restores 358 health and 735 mana over 30 sec. Must remain seated while eating. Usable only inside Arathi Basin.", ["358", "735", "30"]],
    ["Heals 1104 damage over 8 sec. Usable only inside Arathi Basin.", ["1104", "8"]],
    ["Increases your Attack Power by 14 for 30 sec.", ["14", "30"]],
    ["Increases your healing done by up to 38 for 30 sec.", ["38", "30"]],
    ["Increases your Spell Damage by 20 for 30 sec.", ["20", "30"]],
    ["Increases your attack speed by 10% for 30 sec.", ["10%", "30"]],
    ["Heal your target for 648 to 792.", ["648", "792"]],
    ["Increases armor by 250 for 1 hr.", ["250", "1"]],
    ["Increases the target's Spirit by 30 for 30 min.", ["30"]],
    ["Increases your effective stealth level by 2.", ["2"]],
    ["Increases the target's Armor by 200 for 30 min.", ["200", "30"]],
    ["Wounds the target causing them to bleed for 85 damage over 30 sec.", ["85", "30"]],
    ["Increases spell damage by up to 20 for 30 min.", ["20", "30"]],
    ["Hurls a fiery ball that causes 86 to 110 Fire damage and an additional 18 damage over 6 sec.", ["86", "110", "18", "6"]],
    ["When struck in combat has a 5% chance of inflicting 35 to 65 Nature damage to the attacker.", ["5%", "35", "65"]],
    ["Restores 3% of your health and mana per second for 25 sec. Must remain seated while eating.", ["3%", "25"]],
    ["Restores 2% of your health per second for 25 sec. Must remain seated while eating.", ["2%", "25"]],
    ["Drink to increase healing done by spells and effects by up to 30. Lasts 30 min.", ["30"]],
    ["Regenerate 6 health every 5 sec for 1 hr.", ["6", "5", "1"]],
    ["Restores 5 Mana per 5 sec.", ["5"]],
    ["Restores 5 Health per 5 sec.", ["5"]],
    ["Instantly increases your rage by 30.", ["30"]],
    ["Restores 525 to 675 mana and health.", ["525", "675"]],
    ["Reduces target enemy's attack power by 60 for 30 sec.", ["60", "30"]],
    ["Thrown hammers have a low chance to stun the target for 1 sec.", ["1"]],
    ["A crystal shield surrounds the friendly target, doing 12 damage to anyone who hits him. Lasts 10 min.", ["12", "10"]],
    ["Chance on hit to grant nearby party members 4% increased critical strike chance.", ["4"]],
    ["Heals wielder of 182 damage over 14 sec.", ["182", "14"]],
    ["Fear all Demons within $r yards for 6 sec.", ["$r", "6"]],
    ["Permanently enchant a cloak to give 60 additional armor.", ["60"]],
    ["Increases Rage by 60 and increases Strength by 60 for 20 sec.", ["60", "20"]],
    ["Drink to gain 25 Agility and Intellect for 30 min. Lasts for 30 min.", ["25", "30"]],
    ["Drink to gain 400 maximum health and 500 armor for 30 min. Lasts for 30 min.", ["400", "500", "30"]],
    ["Increases Spell Damage by 108 and Attack Power by 185 against Beasts. Lasts 2 min.", ["108", "185", "2"]],
    ["Increases Spell Damage by 108 and Attack Power by 185 against Demons. Lasts 2 min.", ["108", "185", "2"]],
    ["Melee attacks deal 98 Fire additional damage against Frozen targets.", ["98"]],
    ["Spells and attacks against Murlocs deal 8 Shadow damage.", ["8"]],
    ["Chance on harmful spell cast to reduce target enemy's attack power by 60 for 30 sec.", ["60", "30"]],
    ["Heal self for 270 to 450 and Increases Strength by 120 for 30 sec.", ["270", "450", "120", "30"]],
    ["Target's movement slowed by 30% and increasing the time between attacks by 25% for 5 sec.", ["30", "25", "5"]],
    ["Increases mounted movement speed by 10%, stacking with all other mounted movement speed bonuses. Lasts 360 hr real time.", ["10", "360"]],
    ["Thrown hammers have a chance to concuss the target, slowing movement speed by 20% for 6 sec.", ["20", "6"]],
    ["Increase the damage target Elemental takes from your spells by 15%.", ["15"]],
    ["Bewitch the target Beast, reducing the damage it does to you by 15%.", ["15"]],
    ["Increases damage and healing done by magical spells and effects by up to 26.", ["26"]],
    ["Activate a set of jets to increase your movement speed by up to 140%, for up to 8 sec.", ["140", "8"]],
    ["Launches a sawblade at the target, dealing 40 damage and causing them to bleed for 72 damage over 18 sec.", ["40", "72", "18"]],
    ["A burst of energy fills the caster, increasing his damage by 10 and armor by 150 for 15 sec.", ["10", "150", "15"]],
    ["Increase Attack Power by 55 for 15 sec. This effect is doubled in Volcanic areas.", ["55", "15"]],
    ["Dying inflicts 420 Holy damage to all enemies within $1292746r yards.", ["420", "$1292746r"]],
    ["Causes all Beasts in a $a2 yard radius to run away for 10 sec.", ["$a2", "10"]],
    ["Disease target for 25 Nature damage every 1 sec for 7 sec. Deals 2 times as much damage to Aquatic enemies.", ["25", "1", "7", "2"]],
    ["Imbue a staff with magic for 1 hour, increasing your chance to hit with spells by 3.", ["1", "3"]],
    ["Imbue a dagger with magic for 1 hour, causing it to occasionally restore your mana when it hits a target.", ["1"]],
    ["Imbue a staff with magic for 1 hour, increasing your chance to critically hit with spells by 5%.", ["1", "5"]],
    ["Imbue a sword with magic for 1 hour, causing your Flame Blast cooldown to sometimes reset when you are struck by a melee attack.", ["1"]],
    ["Increases run speed by 25% for 10 sec. While out of combat in Desert areas, gain an additional 25% run speed and become invisible.", ["25", "10"]],
    ["Provides a mountain of tradeskill materials to test tradeskills, as well as money and tokens needed to purchase recipes and materials.", []],
    ["Infuses imbiber with a taint of shadow, making him friendly to the denizens of Jaedenar. Lasts 20 minutes.", ["20"]],
    ["Raise the severed head of Roogug, Horrifying and Silencing all Swine within $r yards for 5 sec.", ["$r", "5"]],
    ["Increases your chance to hit with spells by 1%.", ["1"]],
    ["Increases your fire resistance by 20 for 30 min.", ["20", "30"]],
    ["Increases your frost resistance by 20 for 30 min.", ["20", "30"]],
    ["Removes 1 magic, curse, poison or disease effect on you every 5 seconds for 30 seconds.", ["1", "5", "30"]],
    ["Burns 675 to 1125 mana from those in the blast radius and does 50% of the mana drained in damage to the target. Also Silences targets in the blast for 5 sec.", ["675", "1125", "50", "5"]],
    ["Disrupt a magnetic field between you and your nearby enemy target, knocking you both away.\n\nCan only affect targets up to 2 levels higher than you. Some targets cannot be displaced. Targets can only be affected by this effect once every 2 min.", ["2"]],
    ["Deal 42 Fire and 14 Frost damage, slow the target by 50% for 5 sec, reduce armor by 50, and deal 7 Nature damage every 3 sec for 12 sec.", ["42", "14", "50", "5", "7", "3", "12"]],
    ["Each of your heal over time effects on the target reduces Swiftmend's cooldown by 1 sec when you cast it.", ["1"]],
    ["Your Lacerate hits have a 10% chance to reset the cooldown on Mangle (Bear).", ["10"]],
    ["Restores 200 health and 300 mana over 21 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become refreshed and gain 6 Mana every 5 seconds for 15 min.", ["200", "300", "21", "10", "6", "5", "15"]],
    ["Increases the critical strike chance of your Lessing Healing Wave spell by 4%.", ["4"]],
    ["Attempt to bring down one of the Manticores flying overhead in Shadowgale Forest.", []],
    ["Use the fox fur to temporaily transform a demon in Dae'gun.", []],
    ["Increase your reputation permanently with furbolg of Barkskin Burrow.", []],
    ["Discard of hazardous materials a safe distance away from Gadgetzan and other garbage.", []],
    ["Slice open and gather from target Copper, Tin, Silver, or Iron Vein (does not require Mining).", []],
    ["Restores 32 mana. Restore $s2 times as much if attacking an Earth Elementals, Golems, or Titan-forged enermy.", ["32", "$s2"]],
    ["Calls down a pillar of fire, burning all enemies within the area for 55 to 71 Fire damage and an additional 44 Fire damage over 8 sec. Only one Flamestrike can be active per Mage at a time.", ["55", "71", "44", "8"]],
    ["The sword must be reforged before it can be used. Reforging the sword requires 4 Steel Bars, 4 Strong Flux , 2 Elemental Fire and 2 Heavy Grinding Stones.", ["4", "2"]],
    ["Your casts of Greater Heal, Healing Touch, Healing Wave, or Holy Light. in combat grant up to 40 increased healing and up to 13 increased damage for 15 sec.", ["40", "13", "15"]],
    ["Restores 249 mana over 27 sec. Must remain seated while drinking. If you spend at least 10 seconds drinking you will become well fed and gain $1249907s2 Herbalism skill for 15 min.", ["249", "27", "10", "$1249907s2", "15"]],
    ["Restores 425 health over 30 sec. Must remain seated while eating. If you spend at least 10 sec eating you will become Well Fed and gain 25 Spell Damage, 55 Healing Power, and 10 Stamina for 15 min.", ["425", "30", "10", "25", "55", "15"]],
    ["Drink to significantly increase your stealth detection while you are not moving. Nearby stealthed enemies may reveal a heat trail when they move. Lasts for 30 min.\n\nThis effect persists through death.", ["30"]],
    ["Inflicts 150 to 250 fire damage to those in the blast radius plus an additional 25 nature damage every 2 sec for 10 seconds. Also reduces the movement speed of affected targets by 25% for until cancelled.", ["150", "250", "25", "2", "10"]],
    ["Throw a fragile concoction at the target area, revealing a cloud of Disorienting Smog for 8 sec. Enemies standing within the cloud have their Hit Chance reduced by 10%. Ineffective against targets above level $1252546s2.", ["8", "10", "$1252546s2"]],
    ["Slap a forged delivery receipt onto an empty Waylaid Crate, allowing you to return it to the Azeroth Commerce Authority. for +50 reputation.", ["50"]],
    ["Places a Fishing Hut that grants the ability to catch rare fish for 1 hr, Fishing Skill lures, and provides all of the benefits of a Fish Bowl. Requires a Campfire nearby.\n\nMay be placed over a Fish Bowl to replace it.\nAll camping features share a cooldown of 1 hr.", ["1"]],
    ["Places a Fishing Rack that grants the ability to catch uncommon fish for 1 hr, Fishing Skill lures, and provides all of the benefits of a Fish Bowl. Requires a Campfire nearby.\n\nMay be placed over a Fish Bowl to replace it. All camping features share a cooldown of 1 hr.", ["1"]],
    ["Places a Toxin Study that contains healing potions, anti-venom, and provides all of the benefits of a First Aid Kit. Requires a Campfire nearby.\n\nMay be placed over a First Aid Kit to replace it.\nAll camping features share a cooldown of 1 hr.", ["1"]],
    ["Places a Plague Doctor's Laboratory that contains healing potions, poultices, and provides all of the benefits of a First Aid Kit. Requires a Campfire nearby.\n\nMay be placed over a First Aid Kit to replace it. All camping features share a cooldown of 1 hr.", ["1"]],
    ["Gain the Quick Draw ability:\n\nDraw your ranged weapon and fire a quick shot at an enemy, causing normal ranged weapon damage and reducing the target's movement speed by 50% for 6 sec. Awards 1 combo point.\n\nQuick Draw benefits from all talents and effects that trigger from or modify Sinister Strike.", ["50", "6", "1"]],
    ["Grants your offensive abilities a chance to summon a spore that affects nearby players with Fungal Bloom when killed. This effect lasts for 1 hr.\n\nFungal Bloom\nInflicts 150 Nature damage every 1 sec while also increasing the chance for a melee, ranged, or spell critical by 15% for 15 sec.", ["1", "150", "15"]],
    ["Permanently enchant a Melee Weapon to have a chance to trigger Revelation when a non-periodic spell fails to critically strike. Revelation grants 100% increased critical strike chance to the next spell cast. Revelation's chance to trigger is diminished as your critical strike chance increases.", ["100"]],
    ["Serve a delicious feast that lasts for 3 min and serves up to 40 players.\n\nFood\nRestores 425 health over 30 sec. Must remain seated while eating. If you spend at least 10 sec eating you will become Well Fed and gain 20 Attack Power, 23 Spell Damage, 44 Healing Power, and 10 Stamina for 45 min.", ["3", "40", "425", "30", "10", "20", "23", "44", "45"]],
    ["Stuns target for 8 sec.", ["8"]],
    ["Blasts a target for 77 to 105 Nature damage.", ["77", "105"]],
    ["Restores 100 health every 1 sec for 10 sec.", ["100", "1", "10"]],
    ["Increases Agility by 15 for 1 hr.", ["15", "1"]],
    ["Drink to increase your Spirit by 18. Lasts for 30 min.", ["18", "30"]],
    ["Increases all Resistances by 4. Gain an additional 8 to all Resistances in Forest and Grassland areas.", ["4", "8"]],
    ["Restores 3 Mana per 5 sec. Restores an additional 6 Mana per 5 sec in Forest and Grassland areas.", ["3", "5", "6"]],
    ["Increases Stamina by 10 for 15 min and gets you drunk to boot!", ["10", "15"]],
    ["Restores 358 health and 735 mana over 30 sec. Must remain seated while eating. Usable only inside Darkspear Islands.", ["358", "735", "30"]],
    ["Heals 1104 damage over 8 sec. Usable only inside Darkspear Islands.", ["1104", "8"]],
    ["Restores 358 health and 735 mana over 30 sec. Must remain seated while eating. Usable only inside Warsong Gulch.", ["358", "735", "30"]],
    ["Heals 1104 damage over 8 sec. Usable only inside Warsong Gulch.", ["1104", "8"]],
  ];
  const source = JSON.parse(await readFile(new URL(
    "../../public/data/locales/wow-forever/source.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(await readFile(new URL(
    "../../public/data/items/catalog.json", import.meta.url), "utf8"));
  const currentEffects = new Set(catalog.items.flatMap((item) =>
    item.siteEffects?.map((effect) => effect.text) ?? []));
  const reviewed = JSON.parse(await readFile(new URL(
    "../../data/item-effect-localization/reviewed-effects.json", import.meta.url), "utf8"));
  const mindNumbingEffects = [5237, 6951, 9186].map((id) =>
    catalog.items.find((item) => Number(item.id) === id).siteEffects[0].text);
  const arathiIndex = source.keys.indexOf("AreaTable:3358:1");
  const darkspearIndex = source.keys.indexOf("AreaTable:16606:1");
  const warsongIndex = source.keys.indexOf("AreaTable:3277:1");
  const strangeDustIndex = source.keys.findIndex((key, index) =>
    key.startsWith("ItemSparse:") && key.endsWith(":4") &&
    source.values[index] === "Strange Dust");
  const signIndex = source.keys.indexOf("SpellName:1288249:0");
  const clientMatches = JSON.parse(await readFile(new URL(
    "../../data/item-effect-localization/client-spell-effect-matches.json", import.meta.url), "utf8"));
  const linkedMatches = JSON.parse(await readFile(new URL(
    "../../data/item-effect-localization/client-spell-resolved-effect-matches.json",
    import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createItemEffectDictionary(await read(locale));
    assert.equal(dictionary.get("???"), locale === "zhTW" ? "？？？" : "???");
    const clientPack = JSON.parse(await readFile(new URL(
      `../../public/data/locales/wow-forever/${locale}.json`, import.meta.url), "utf8"));
    const luteOriginal = [...dictionary.keys()].find((effect) =>
      effect.startsWith("Summons an enchanted lute that"));
    const luteTranslated = dictionary.get(luteOriginal);
    assert.ok(luteTranslated && luteTranslated !== luteOriginal, `${locale}: enchanted lute`);
    const conditionalHeads = (value) => value.match(/\$?\?60[<>]\d+/g) ?? [];
    assert.deepEqual(conditionalHeads(luteTranslated), conditionalHeads(luteOriginal));
    for (const key of ["ItemSparse:279976:4", "SpellName:1126:0", "SpellName:1229736:0"]) {
      const nativeName = clientPack.values[source.keys.indexOf(key)];
      assert.ok(luteTranslated.toLowerCase().includes(nativeName.toLowerCase()),
        `${locale}: enchanted lute missing ${key}`);
    }
    const appLocale = { deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr",
      koKR: "ko", ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant" }[locale];
    const appPack = JSON.parse(await readFile(new URL(
      `./locales/${appLocale}.json`, import.meta.url), "utf8"));
    assert.notEqual(dictionary.get(english), english);
    for (const text of shortEffects) {
      assert.ok(dictionary.get(text) && dictionary.get(text) !== text, `${locale}: ${text}`);
    }
    const leylineTerm = { deDE: "Leylinien", esES: "línea Ley", esMX: "línea ley",
      frFR: "ligne tellurique", koKR: "지맥", ptBR: "Meridiano",
      zhCN: "魔网", zhTW: "地脈" }[locale];
    assert.ok(dictionary.get("Siphon magic from a Ley Line Rift.")?.includes(leylineTerm));
    assert.ok(dictionary.get("Returns you to Stormwind. . Single-use.")?.includes(
      clientPack.values[source.keys.indexOf("AreaTable:1519:1")]));
    assert.ok(dictionary.get("Attune yourself to Blackwing Lair!")?.includes(
      clientPack.values[source.keys.indexOf("AreaTable:2677:1")]));
    assert.ok(dictionary.get("Imbue a sword with magic for 1 hour, causing your Flame Blast cooldown to sometimes reset when you are struck by a melee attack.")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:7101:0")]));
    assert.ok(dictionary.get("Infuses imbiber with a taint of shadow, making him friendly to the denizens of Jaedenar. Lasts 20 minutes.")
      ?.includes(clientPack.values[source.keys.indexOf("AreaTable:1763:1")]));
    assert.ok(dictionary.get("Raise the severed head of Roogug, Horrifying and Silencing all Swine within $r yards for 5 sec.")
      ?.includes(clientPack.values[source.keys.indexOf("DungeonEncounter:2773:0")]));
    assert.ok(dictionary.get("Each of your heal over time effects on the target reduces Swiftmend's cooldown by 1 sec when you cast it.")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:18562:0")]));
    const lacerateEffect = dictionary.get("Your Lacerate hits have a 10% chance to reset the cooldown on Mangle (Bear).") ?? "";
    assert.ok(lacerateEffect.includes(clientPack.values[source.keys.indexOf("SpellName:414644:0")]));
    assert.ok(lacerateEffect.includes(clientPack.values[source.keys.indexOf("SpellName:409828:0")]));
    assert.ok(dictionary.get("Increases the critical strike chance of your Lessing Healing Wave spell by 4%.")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:8004:0")]));
    assert.ok(dictionary.get("Attempt to bring down one of the Manticores flying overhead in Shadowgale Forest.")
      ?.includes(clientPack.values[source.keys.indexOf("AreaTable:16631:1")]));
    assert.ok(dictionary.get("Use the fox fur to temporaily transform a demon in Dae'gun.")
      ?.includes(clientPack.values[source.keys.indexOf("ItemSparse:275957:4")]));
    assert.ok(dictionary.get("Use the fox fur to temporaily transform a demon in Dae'gun.")
      ?.includes(clientPack.values[source.keys.indexOf("AreaTable:16866:1")]));
    assert.ok(dictionary.get("Increase your reputation permanently with furbolg of Barkskin Burrow.")
      ?.includes(clientPack.values[source.keys.indexOf("Faction:2747:0")]));
    assert.ok(dictionary.get("Discard of hazardous materials a safe distance away from Gadgetzan and other garbage.")
      ?.includes(clientPack.values[source.keys.indexOf("AreaTable:976:1")]));
    assert.ok(dictionary.get("Slice open and gather from target Copper, Tin, Silver, or Iron Vein (does not require Mining).")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:2575:0")]));
    assert.ok(dictionary.get("Calls down a pillar of fire, burning all enemies within the area for 55 to 71 Fire damage and an additional 44 Fire damage over 8 sec. Only one Flamestrike can be active per Mage at a time.")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:2120:0")]));
    const healingEffect = dictionary.get("Your casts of Greater Heal, Healing Touch, Healing Wave, or Holy Light. in combat grant up to 40 increased healing and up to 13 increased damage for 15 sec.") ?? "";
    for (const spellKey of ["SpellName:2060:0", "SpellName:5185:0", "SpellName:331:0", "SpellName:635:0"]) {
      assert.ok(healingEffect.includes(clientPack.values[source.keys.indexOf(spellKey)]));
    }
    for (const english of [
      "Restores 249 mana over 27 sec. Must remain seated while drinking. If you spend at least 10 seconds drinking you will become well fed and gain $1249907s2 Herbalism skill for 15 min.",
      "Restores 425 health over 30 sec. Must remain seated while eating. If you spend at least 10 sec eating you will become Well Fed and gain 25 Spell Damage, 55 Healing Power, and 10 Stamina for 15 min.",
    ]) {
      assert.ok(dictionary.get(english)?.includes(clientPack.values[source.keys.indexOf("SpellName:19705:0")]));
    }
    assert.ok(dictionary.get("Restores 249 mana over 27 sec. Must remain seated while drinking. If you spend at least 10 seconds drinking you will become well fed and gain $1249907s2 Herbalism skill for 15 min.")
      ?.includes(clientPack.values[source.keys.indexOf("SpellName:2366:0")]));
    const receiptEffect = dictionary.get("Slap a forged delivery receipt onto an empty Waylaid Crate, allowing you to return it to the Azeroth Commerce Authority. for +50 reputation.") ?? "";
    for (const key of ["ItemSparse:262902:4", "ItemSparse:248549:4", "Faction:2586:0"]) {
      assert.ok(receiptEffect.includes(clientPack.values[source.keys.indexOf(key)]));
    }
    for (const [facility, itemId] of [["Fishing Hut", 279966], ["Fishing Rack", 279965]]) {
      const [english] = numericEffects.find(([effect]) => effect.startsWith(`Places a ${facility} that`));
      const translated = dictionary.get(english) ?? "";
      for (const key of [`ItemSparse:${itemId}:4`, "ItemSparse:279967:4", "SpellName:1229736:0"]) {
        assert.ok(translated.includes(clientPack.values[source.keys.indexOf(key)]));
      }
    }
    for (const [facility, spellId] of [["Toxin Study", 1262996], ["Plague Doctor's Laboratory", 1263001]]) {
      const [english] = numericEffects.find(([effect]) => effect.startsWith(`Places a ${facility} that`));
      const translated = dictionary.get(english) ?? "";
      for (const key of [`SpellName:${spellId}:0`, "ItemSparse:279968:4", "SpellName:1229736:0"]) {
        assert.ok(translated.includes(clientPack.values[source.keys.indexOf(key)]));
      }
    }
    for (const [prefix, nativeKeys] of [
      ["Constructs a sharpening wheel", ["ItemSparse:279944:4", "SpellName:8075:0"]],
      ["Constructs a mana well", ["ItemSparse:279956:4", "SpellName:19742:0"]],
      ["Unrolls a banner that allows you and others members of the Horde", ["ItemSparse:279972:4", "Faction:67:0", "SpellName:14752:0"]],
      ["Unrolls a banner that allows you and others members of the Alliance", ["ItemSparse:279972:4", "Faction:469:0", "SpellName:14752:0"]],
      ["Ignites an incense candle", ["ItemSparse:279962:4", "SpellName:1459:0"]],
      ["Unpacks a first aid kit", ["ItemSparse:279968:4", "SpellName:1243:0"]],
      ["Erects a lodestone", ["ItemSparse:279960:4", "SpellName:19740:0"]],
    ]) {
      const original = [...dictionary.keys()].find((effect) => effect.startsWith(prefix));
      assert.ok(original, `${locale}: ${prefix}`);
      const translated = dictionary.get(original);
      assert.ok(translated && translated !== original, `${locale}: ${prefix}`);
      assert.ok(translated.includes(original.match(/\$\?60[^\s]*/)?.[0]), `${locale}: ${prefix} conditional`);
      assert.ok(translated.includes(clientPack.values[source.keys.indexOf("SpellName:1229736:0")]));
      for (const key of nativeKeys) {
        assert.ok(translated.includes(clientPack.values[source.keys.indexOf(key)]), `${locale}: ${key}`);
      }
    }
    const [quickDrawEnglish] = numericEffects.find(([effect]) => effect.startsWith("Gain the Quick Draw ability:"));
    const quickDraw = dictionary.get(quickDrawEnglish) ?? "";
    for (const key of ["SpellName:398196:0", "SpellName:1752:0"]) {
      assert.ok(quickDraw.includes(clientPack.values[source.keys.indexOf(key)]));
    }
    const [fungalEnglish] = numericEffects.find(([effect]) => effect.startsWith("Grants your offensive abilities a chance to summon a spore"));
    assert.ok(dictionary.get(fungalEnglish)?.includes(clientPack.values[source.keys.indexOf("SpellName:29232:0")]));
    const [revelationEnglish] = numericEffects.find(([effect]) => effect.startsWith("Permanently enchant a Melee Weapon to have a chance to trigger Revelation"));
    assert.ok(dictionary.get(revelationEnglish)?.includes(clientPack.values[source.keys.indexOf("SpellName:1248806:0")]));
    const [feastEnglish] = numericEffects.find(([effect]) => effect.startsWith("Serve a delicious feast that lasts for 3 min"));
    assert.ok(dictionary.get(feastEnglish)?.includes(clientPack.values[source.keys.indexOf("SpellName:19705:0")]));
    if (["deDE", "koKR", "zhCN", "zhTW"].includes(locale)) {
      const twoHandEnchant = dictionary.get("Permanently enchant a 2H Weapon to add 65 Spell Power.") ?? "";
      assert.ok(twoHandEnchant.includes(appPack.database.clientItem.stat["45"]));
      assert.match(twoHandEnchant, { deDE: /Zweihandwaffe/, koKR: /양손 무기/,
        zhCN: /双手武器/, zhTW: /雙手武器/ }[locale]);
    }
    assert.ok(dictionary.get("Increased Polearms +1.")?.toLocaleLowerCase().includes(
      clientPack.values[source.keys.indexOf("SkillLine:229:0")].toLocaleLowerCase()));
    const duskwoodKey = locale === "frFR" ? "AreaTable:16148:1" : "AreaTable:10:1";
    assert.ok(dictionary.get("Movement speed increased by 2% in Duskwood.")
      ?.toLocaleLowerCase().includes(
        clientPack.values[source.keys.indexOf(duskwoodKey)].toLocaleLowerCase()));
    const silverpineName = clientPack.values[source.keys.indexOf("AreaTable:130:1")]
      .replace(/ \(Silverpine Forest\)$/, "");
    assert.ok(dictionary.get("Movement speed increased by 2% in Silverpine Forest and Hillsbrad Foothills.")
      ?.toLocaleLowerCase().includes(silverpineName.toLocaleLowerCase()));
    for (const [text, spellKey] of cooldownEffects) {
      if (!currentEffects.has(text)) continue;
      assert.ok(dictionary.get(text)?.includes(clientPack.values[source.keys.indexOf(spellKey)]),
        `${locale}: ${text}`);
    }
    for (const [text, spellKey] of abilityModifierEffects) {
      if (!currentEffects.has(text)) continue;
      assert.ok(dictionary.get(text)?.includes(clientPack.values[source.keys.indexOf(spellKey)]),
        `${locale}: ${text}`);
    }
    if (locale === "ptBR") {
      assert.ok(dictionary.get("Teaches Imp Phase Shift.")?.includes(
        clientPack.values[source.keys.indexOf("SpellName:4511:0")]));
      assert.ok(dictionary.get("Teaches Felhunter Spell Lock (Rank 2).")?.includes(
        clientPack.values[source.keys.indexOf("SpellName:19647:0")]));
      assert.ok(dictionary.get("In a Forest or Grassland area, Attack Power increased by an additional 28.")
        ?.includes(appPack.database.clientItem.stat["38"].toLocaleLowerCase()));
      for (const amount of [5, 7, 8]) {
        assert.ok(dictionary.get(`In a Forest or Grassland area, all Resistances increased by an additional ${amount}.`)
          ?.includes(String(amount)));
      }
      assert.ok(dictionary.get("In a Forest or Grassland area, Spell Piercing increased by an additional 7.")
        ?.includes(appPack.database.clientItem.stat["47"].toLocaleLowerCase()));
    }
    if (locale === "koKR") {
      for (const text of ["Summons your pet fish. He used to look healthier....",
        "Summons your pet stone. It doesn't seem very active though..."]) {
        assert.doesNotMatch(dictionary.get(text), /Summons your pet/);
      }
      const teaching = dictionary.get(
        "Teaches Defensive Stance, Sunder Armor (Rank 1), and Taunt (Rank 1).");
      for (const spellKey of ["SpellName:71:0", "SpellName:7386:0", "SpellName:355:0"]) {
        assert.ok(teaching?.includes(clientPack.values[source.keys.indexOf(spellKey)]));
      }
      assert.ok(dictionary.get("Increases swim speed by 15%.")?.includes("15%"));
      assert.ok(dictionary.get("Increases Stamina for 1 hour.")?.includes(
        appPack.database.clientItem.stat["7"]));
      assert.notEqual(dictionary.get("Grants an extra attack on your next swing."),
        "Grants an extra attack on your next swing.");
      for (const difficulty of ["simple", "standard", "difficult", "hard"]) {
        assert.ok(dictionary.get(`Allows opening of ${difficulty} locks. The skeleton key is consumed in the process.`)
          ?.includes("해골 열쇠"));
      }
    }
    if (locale === "zhCN") {
      for (const [stat, key] of [["Intellect", "5"], ["Spirit", "6"],
        ["Agility", "3"], ["Stamina", "7"], ["Strength", "4"]]) {
        assert.ok(dictionary.get(`Increases ${stat} by 25 when consumed.`)?.includes(
          appPack.database.clientItem.stat[key]));
      }
    }
    if (locale === "zhCN" || locale === "zhTW") {
      for (const record of reviewed.giftCollection.combinations) {
        const translated = dictionary.get(record.english);
        assert.ok(translated && translated !== record.english);
        for (const id of [...record.parts, record.result]) {
          assert.ok(translated.includes(clientPack.values[
            source.keys.indexOf(`ItemSparse:${id}:4`)]));
        }
      }
    }
    if (locale === "koKR" || locale === "zhTW") {
      for (const [set, ids] of Object.entries(reviewed.cardDeckCompletion.sets)) {
        const text = `Combine the Ace through Eight of ${set} to complete the set.`;
        const translated = dictionary.get(text);
        assert.ok(translated && translated !== text);
        for (const id of ids) {
          assert.ok(translated.includes(clientPack.values[
            source.keys.indexOf(`ItemSparse:${id}:4`)]));
        }
      }
    }
    if (locale === "frFR") {
      assert.notEqual(dictionary.get("Dig up treasure at the marked location"),
        "Dig up treasure at the marked location");
    }
    if (locale === "deDE") {
      assert.match(dictionary.get("Reduces an enemy's armor by 165. Stacks up to 3 times."),
        /165.*3/);
    }
    for (const text of mindNumbingEffects) {
      const translated = dictionary.get(text);
      assert.ok(translated && translated !== text && translated.includes("\n"), `${locale}: ${text}`);
      for (const amount of text.match(/\d+/g)) assert.ok(translated.includes(amount));
    }
    assert.ok(dictionary.get(english));
    assert.notEqual(dictionary.get(food), food);
    assert.notEqual(dictionary.get(drink), drink);
    assert.match(dictionary.get(food), /17/);
    assert.match(dictionary.get(food), /18/);
    assert.match(dictionary.get(drink), /249/);
    assert.match(dictionary.get(drink), /27/);
    assert.notEqual(dictionary.get(wellFed), wellFed);
    assert.match(dictionary.get(wellFed), /358/);
    assert.match(dictionary.get(wellFed), /28/);
    assert.ok(dictionary.get(dualStatFood) && dictionary.get(dualStatFood) !== dualStatFood);
    for (const [index, text] of largeDualStatFoods.entries()) {
      const translated = dictionary.get(text);
      assert.ok(translated && translated !== text);
      for (const amount of ["425", "30", "10", "25", "15"]) assert.ok(translated.includes(amount));
      assert.ok(translated.includes(clientPack.values[source.keys.indexOf("SpellName:19705:0")]));
      assert.ok(translated.includes(appPack.database.clientItem.stat[index === 0 ? "3" : "4"]));
      assert.ok(translated.includes(appPack.database.clientItem.stat["7"]));
    }
    for (const text of specialWellFedFoods) {
      const translated = dictionary.get(text);
      assert.ok(translated && translated !== text);
      assert.ok(translated.includes(clientPack.values[source.keys.indexOf("SpellName:19705:0")]));
    }
    const hyjal = clientPack.values[source.keys.indexOf("AreaTable:616:1")];
    assert.ok(dictionary.get(specialWellFedFoods[1]).toLocaleLowerCase().includes(
      hyjal.toLocaleLowerCase()));
    const westfall = clientPack.values[source.keys.indexOf("AreaTable:40:1")]
      .replace(/ \(Westfall\)$/, "");
    assert.ok(dictionary.get(specialWellFedFoods[2]).toLocaleLowerCase().includes(
      westfall.toLocaleLowerCase()));
    assert.ok(dictionary.get(manaWellFed) && dictionary.get(manaWellFed) !== manaWellFed);
    assert.ok(dictionary.get(fishingWellFed)?.includes(
      linkedMatches.fishingWellFedSource.translations[locale].match(
        { deDE: /Angelfertigkeit/, esES: /p\. de habilidad en pesca/,
          esMX: /p\. de habilidad de pesca/, frFR: /compétence en pêche/,
          koKR: /낚시 숙련도/, ptBR: /perícia em Pesca/,
          zhCN: /钓鱼技能/, zhTW: /釣魚技能/ }[locale])[0]));
    assert.match(dictionary.get(manaWellFed), /249/);
    assert.match(dictionary.get(manaWellFed), /27/);
    if (locale === "deDE") {
      assert.match(dictionary.get(manaWellFed), /Trinken/);
      assert.doesNotMatch(dictionary.get(manaWellFed), /Essen/);
    }
    assert.notEqual(dictionary.get(teaching), teaching);
    assert.match(dictionary.get(teaching), /3/);
    assert.ok(dictionary.get(healingStreamTeaching)?.includes(
      clientPack.values[source.keys.indexOf("SpellName:5394:0")]));
    assert.ok(dictionary.get(stoneskinTeaching)?.includes(
      clientPack.values[source.keys.indexOf("SpellName:8071:0")]));
    assert.ok(dictionary.get(shamanSpirits) && dictionary.get(shamanSpirits) !== shamanSpirits);
    assert.ok(dictionary.get(linkedHolyEffect) &&
      dictionary.get(linkedHolyEffect) !== linkedHolyEffect);
    assert.match(dictionary.get(linkedHolyEffect), /13/);
    assert.match(dictionary.get(linkedHolyEffect), /15/);
    assert.ok(dictionary.get(crateBundle)?.startsWith(
      linkedMatches.crateHeader.translations[locale]));
    assert.ok(dictionary.get(crateBundle).includes(
      `20 × ${clientPack.values[strangeDustIndex]}`));
    if (["esES", "esMX", "koKR"].includes(locale)) {
      const greater = "Turn a greater astral essence into three lesser ones.";
      const lesser = "Turn three lesser astral essences into a greater one.";
      const greaterName = clientPack.values[source.keys.indexOf("ItemSparse:11082:4")];
      const lesserName = clientPack.values[source.keys.indexOf("ItemSparse:10998:4")];
      for (const text of [greater, lesser]) {
        assert.ok(dictionary.get(text)?.includes(greaterName));
        assert.ok(dictionary.get(text)?.includes(lesserName));
      }
    }
    if (locale === "deDE") {
      assert.equal(dictionary.get("Heals 2000 damage over 8 sec."),
        "Heilt im Verlauf von 8 Sek. 2000 Schaden.");
      for (const [ingredient, materialId, crest, crestId] of [
        ["Firebloom", 4625, "Fire", 20416],
        ["Elemental Air", 7069, "Thunder", 20418],
        ["Dense Stone", 12365, "Earth", 20419],
        ["Enchanted Water", 4791, "Water", 20420],
      ]) {
        const effect = dictionary.get(`Combine with 1 Rugged Leather and 1 ${ingredient} to create a Crest of Beckoning: ${crest}.`);
        assert.ok(effect?.includes(clientPack.values[source.keys.indexOf("ItemSparse:8170:4")]));
        assert.ok(effect?.includes(clientPack.values[source.keys.indexOf(`ItemSparse:${materialId}:4`)]));
        assert.ok(effect?.includes(clientPack.values[source.keys.indexOf(`ItemSparse:${crestId}:4`)]));
      }
      for (const [amount, charges] of [[67, 90], [92, 115], [128, 135], [165, 160]]) {
        const effect = `Coats a weapon with poison that lasts for 30 minutes.\nEach strike has a 30% chance of poisoning the enemy, reducing all healing effects used on them by ${amount} for 15 sec. Stacks up to 5 times on a single target. ${charges} charges.`;
        assert.ok(dictionary.get(effect)?.includes(`${amount}`));
        assert.ok(dictionary.get(effect)?.includes(`${charges}`));
        assert.notEqual(dictionary.get(effect), effect);
      }
    }
    if (locale === "deDE" || locale === "koKR") {
      for (const volume of ["I", "II", "III"]) {
        const effect = `Combines the Top and Bottom Half of Advanced Armorsmithing: Volume ${volume}.`;
        assert.ok(dictionary.get(effect)?.includes(volume));
        assert.notEqual(dictionary.get(effect), effect);
      }
    }
    if (clientMatches.effects[shamanSpirits]?.translations[locale]) {
      assert.equal(dictionary.get(shamanSpirits),
        clientMatches.effects[shamanSpirits].translations[locale]);
    }
    assert.ok(dictionary.get(tradeskillSign)?.includes(clientPack.values[signIndex]));
    assert.ok(dictionary.get("Reduces target enemy's attack power by 60 for 30 sec.")
      ?.toLocaleLowerCase().includes(appPack.database.clientItem.stat["38"].toLocaleLowerCase()));
    for (const creature of ["Beasts", "Demons"]) {
      const translated = dictionary.get(
        `Increases Spell Damage by 108 and Attack Power by 185 against ${creature}. Lasts 2 min.`)
        ?.toLocaleLowerCase();
      assert.ok(translated?.includes(appPack.database.clientItem.stat["38"].toLocaleLowerCase()));
      assert.ok(translated?.includes(appPack.database.clientItem.stat["42"].toLocaleLowerCase()));
    }
    for (const [source, numbers] of numericEffects) {
      const translated = dictionary.get(source);
      assert.ok(translated && translated !== source, `${locale}: ${source}`);
      for (const number of numbers) assert.ok(translated.includes(number), `${locale}: ${number}`);
    }
    for (const [english] of numericEffects.filter(([text]) => text.includes("Arathi Basin"))) {
      assert.ok(dictionary.get(english).includes(clientPack.values[arathiIndex]));
    }
    for (const [area, index] of [["Darkspear Islands", darkspearIndex],
      ["Warsong Gulch", warsongIndex]]) {
      for (const [english] of numericEffects.filter(([text]) => text.includes(area))) {
        assert.ok(dictionary.get(english).includes(clientPack.values[index]));
      }
    }
    assert.ok(dictionary.size >= 1500, `${locale}: reviewed effect coverage regressed`);
  }
});

test("malformed item effect packs are rejected", () => {
  assert.throws(() => createItemEffectDictionary({ version: 2, translations: {} }));
  assert.throws(() => createItemEffectDictionary({ version: 1, translations: { x: "" } }));
});
