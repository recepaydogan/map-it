/** Localize reviewed quest and NPC names left in contextual guide prose. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = (await read("data/quest-title-localization/polestar-forever-titles.json")).titles;
const npcCatalog = (await read("data/npc-name-localization/polestar-forever-names.json")).names;
const english = await read("public/data/guides/leveling-warrior.json");
const englishHunter = await read("public/data/guides/leveling-hunter.json");
const englishRogue = await read("public/data/guides/leveling-rogue.json");
const englishMage = await read("public/data/guides/leveling-mage.json");
const englishWarlock = await read("public/data/guides/leveling-warlock.json");
const reviewed = {
  "A Warrior's Training": 1638,
  "Brutal Armor": 1838,
  "Brutal Gauntlets": 1843,
  "Fire Hardened Mail": 1701,
  "Forged Steel": 1503,
  "Grey Iron Weapons": 1682,
  "Grimand's Armor": 1706,
  "Heirloom Weapon": 1822,
  "Klockmort's Creation": 1709,
  "Mathiel's Armor": 1711,
  "Path of Defense": 1498,
  "Speak with Dillinger": 1818,
  "Speak with Ruga": 1823,
  "Speak with Thun'grim": 1825,
  "The Rethban Gauntlet": 1699,
  "The Shieldsmith": 1702,
  "Trial at the Field of Giants": 1824,
  "Weapons of Elunite": 1693,
  "The Islander": 1718,
  "The Windwatcher": 1791,
};
const reviewedNpcs = {
  "Austil de Mon": 2131,
  Bartleby: 6090,
  "Coleman Farthing": 1500,
  "Conservator Ilthalaine": 2079,
  "Deathguard Dillinger": 1496,
  Elanaria: 4088,
  "Furen Longbeard": 5413,
  "Granis Swiftaxe": 1229,
  "Grimand Elmore": 1416,
  "Grull Hawkwind": 2980,
  "Harry Burlguard": 6089,
  "Klannoc Macleod": 6236,
  "Klockmort Spannerspan": 6169,
  "Krang Stonehoof": 3063,
  "Lyria Du Lac": 913,
  "Marshal McBride": 197,
  "Moon Priestess Amara": 2151,
  "Muren Stormpike": 6114,
  "Ruga Ragetotem": 6394,
  "Shadow Priest Sarvis": 1569,
  "Sten Stoutarm": 658,
  "Thun'grim Firegaze": 5878,
  "Torm Ragetotem": 3041,
  "Tormus Deepforge": 6031,
  "Yorus Barleybrew": 6166,
};
const reviewedHunterQuests = {
  "Etched Note": 3092,
  "Etched Parchment": 3087,
  "Etched Rune": 3108,
  "Etched Sigil": 3117,
  "Etched Tablet": 3082,
};
const reviewedRogueQuests = {
  "Deep Cover": 2458,
  "Destiny Calls": 2242,
  "Erion's Behest": 2260,
  "Find the Shattered Hand": 2378,
  "Kingly Shakedown": 2298,
  "Mathias and the Defias": 2360,
  "Redridge Rendezvous": 2281,
  "Road to Salvation": 2218,
  "Seek out SI: 7": 2205,
  "Simple Subterfugin'": 2238,
  "Snatch and Grab": 2206,
  "The Apple Falls": 2241,
  "The Deathstalkers": 1886,
  "The Shattered Hand": 1858,
  "The Shattered Salute": 2460,
  "The Touch of Zanzil": 2607,
  "To Hulfdan!": 2299,
  "To Orgrimmar!": 2380,
  "Tools of the Trade": 1999,
};
const reviewedMageQuests = {
  "Astral Knot Garment": 1942,
  "Deviate Eradication": 1487,
  "Gathering Materials": 1921,
  "Glyphic Letter": 3104,
  "Glyphic Memorandum": 3114,
  "Glyphic Scroll": 3098,
  "Glyphic Tablet": 3086,
  "High Sorcerer Andromath": 1939,
  "Investigate the Alchemist Shop": 1960,
  "Investigate the Blue Recluse": 1920,
  "Ju-Ju Heaps": 1884,
  "Laughing Sisters": 1945,
  "Mage-tastic Gizmonitor": 1880,
  "Manaweave Robe": 1941,
  "Mirror Lake": 1861,
  "Nether-lace Garment": 1946,
  "Pristine Spider Silk": 1940,
  "Report to Anastasia": 1959,
  "Report to Jennea": 1919,
  "Speak with Anastasia": 1881,
  "Speak with Bink": 1879,
  "Speak with Jennea": 1860,
  "Speak with Un'thuwa": 1883,
  "Spellfire Robes": 1962,
  "The Balnir Farmstead": 1882,
  "Underground Assault": 2040,
  "Ur's Treatise on Shadow Magic": 1938,
  "Waters of Xavian": 1944,
};
const reviewedWarlockQuests = {
  Beginnings: 1599,
  "Gakin's Summons": 1685,
  "Gan'rul's Summons": 1506,
  "Halgar's Summons": 1478,
  "Hearts of the Pure": 1476,
  Heartswood: 1738,
  "Piercing the Veil": 1470,
  "Tainted Letter": 3105,
  "Tainted Memorandum": 3115,
  "Tainted Parchment": 3090,
  "Tainted Scroll": 3099,
  "The Orb of Soran'ruk": 1740,
  "The Slaughtered Lamb": 1715,
  "The Stolen Tome": 1598,
};
const terms = Object.keys(reviewed).sort((a, b) => b.length - a.length);
const npcTerms = Object.keys(reviewedNpcs).sort((a, b) => b.length - a.length);
for (const name of terms) {
  if (!catalog[name]?.questIds.includes(reviewed[name]) || !english.html.includes(name)) {
    throw new Error(`Warrior quest title evidence changed: ${name}`);
  }
}
for (const name of npcTerms) {
  if (!npcCatalog[name]?.npcIds.includes(reviewedNpcs[name]) || !english.html.includes(name)) {
    throw new Error(`Warrior NPC name evidence changed: ${name}`);
  }
}
for (const [name, id] of Object.entries(reviewedHunterQuests)) {
  if (!catalog[name]?.questIds.includes(id) || !englishHunter.html.includes(name)) {
    throw new Error(`Hunter quest title evidence changed: ${name}`);
  }
}
for (const [name, id] of Object.entries(reviewedRogueQuests)) {
  if (!catalog[name]?.questIds.includes(id) || !englishRogue.html.includes(name)) {
    throw new Error(`Rogue quest title evidence changed: ${name}`);
  }
}
for (const [name, id] of Object.entries(reviewedMageQuests)) {
  if (!catalog[name]?.questIds.includes(id) || !englishMage.html.includes(name)) {
    throw new Error(`Mage quest title evidence changed: ${name}`);
  }
}
for (const [name, id] of Object.entries(reviewedWarlockQuests)) {
  if (!catalog[name]?.questIds.includes(id) || !englishWarlock.html.includes(name)) {
    throw new Error(`Warlock quest title evidence changed: ${name}`);
  }
}
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const check = process.argv.includes("--check");
for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
  const path = join(root, `public/data/guides/locales/${language}/leveling-warrior.json`);
  const raw = await readFile(path, "utf8");
  const guide = JSON.parse(raw);
  let questCount = 0;
  let npcCount = 0;
  guide.html = guide.html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    for (const name of terms) {
      const localized = catalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { questCount += 1; return escapeHtml(localized); });
    }
    for (const name of npcTerms) {
      const localized = npcCatalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { npcCount += 1; return escapeHtml(localized); });
    }
    return part;
  }).join("");
  const output = JSON.stringify(guide) + (raw.endsWith("\n") ? "\n" : "");
  if (check && output !== raw) throw new Error(`${language}: Warrior game names are stale`);
  if (!check && output !== raw) await writeFile(path, output);
  console.log(`${language}: ${questCount} Warrior quest titles and ${npcCount} NPC names localized`);

  const hunterPath = join(root, `public/data/guides/locales/${language}/leveling-hunter.json`);
  const hunterRaw = await readFile(hunterPath, "utf8");
  const hunter = JSON.parse(hunterRaw);
  let hunterCount = 0;
  hunter.html = hunter.html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    for (const name of Object.keys(reviewedHunterQuests)) {
      const localized = catalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { hunterCount += 1; return escapeHtml(localized); });
    }
    return part;
  }).join("");
  const hunterOutput = JSON.stringify(hunter) + (hunterRaw.endsWith("\n") ? "\n" : "");
  if (check && hunterOutput !== hunterRaw) throw new Error(`${language}: Hunter game names are stale`);
  if (!check && hunterOutput !== hunterRaw) await writeFile(hunterPath, hunterOutput);
  console.log(`${language}: ${hunterCount} Hunter quest titles localized`);

  const roguePath = join(root, `public/data/guides/locales/${language}/leveling-rogue.json`);
  const rogueRaw = await readFile(roguePath, "utf8");
  const rogue = JSON.parse(rogueRaw);
  let rogueCount = 0;
  rogue.html = rogue.html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    for (const name of Object.keys(reviewedRogueQuests).sort((a, b) => b.length - a.length)) {
      const localized = catalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { rogueCount += 1; return escapeHtml(localized); });
    }
    return part;
  }).join("");
  const rogueOutput = JSON.stringify(rogue) + (rogueRaw.endsWith("\n") ? "\n" : "");
  if (check && rogueOutput !== rogueRaw) throw new Error(`${language}: Rogue game names are stale`);
  if (!check && rogueOutput !== rogueRaw) await writeFile(roguePath, rogueOutput);
  console.log(`${language}: ${rogueCount} Rogue quest titles localized`);

  const magePath = join(root, `public/data/guides/locales/${language}/leveling-mage.json`);
  const mageRaw = await readFile(magePath, "utf8");
  const mage = JSON.parse(mageRaw);
  let mageCount = 0;
  mage.html = mage.html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    for (const name of Object.keys(reviewedMageQuests).sort((a, b) => b.length - a.length)) {
      const localized = catalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { mageCount += 1; return escapeHtml(localized); });
    }
    return part;
  }).join("");
  const mageOutput = JSON.stringify(mage) + (mageRaw.endsWith("\n") ? "\n" : "");
  if (check && mageOutput !== mageRaw) throw new Error(`${language}: Mage game names are stale`);
  if (!check && mageOutput !== mageRaw) await writeFile(magePath, mageOutput);
  console.log(`${language}: ${mageCount} Mage quest titles localized`);

  const warlockPath = join(root, `public/data/guides/locales/${language}/leveling-warlock.json`);
  const warlockRaw = await readFile(warlockPath, "utf8");
  const warlock = JSON.parse(warlockRaw);
  let warlockCount = 0;
  warlock.html = warlock.html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    for (const name of Object.keys(reviewedWarlockQuests).sort((a, b) => b.length - a.length)) {
      const localized = catalog[name][language];
      if (!localized || localized === name) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "gu");
      part = part.replace(pattern, () => { warlockCount += 1; return escapeHtml(localized); });
    }
    return part;
  }).join("");
  const warlockOutput = JSON.stringify(warlock) + (warlockRaw.endsWith("\n") ? "\n" : "");
  if (check && warlockOutput !== warlockRaw) throw new Error(`${language}: Warlock game names are stale`);
  if (!check && warlockOutput !== warlockRaw) await writeFile(warlockPath, warlockOutput);
  console.log(`${language}: ${warlockCount} Warlock quest titles localized`);
}
