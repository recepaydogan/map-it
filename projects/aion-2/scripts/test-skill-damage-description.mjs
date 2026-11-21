import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { skillDamageDescription } from "../src/features/reference/skill-damage-description.ts";
import { skillDescriptionParts } from "../src/features/reference/skill-description-parts.ts";

const records = JSON.parse(await readFile(new URL("../public/data/reference/skill-damage/1c.json", import.meta.url), "utf8")).skills;
const leapingSlam = records["Skill:9361"];
assert(leapingSlam, "Leaping Slam damage data must be available");

const baseValue = (base) => `${base} base`;
const text = skillDamageDescription(leapingSlam.description, leapingSlam, 1, "en", baseValue);
assert(text.includes("deals 70 base damage."), "Level 1 damage should show its base value");
assert(!text.includes("variable"), "The description should not show a generic damage label");
assert(skillDamageDescription(leapingSlam.description, leapingSlam, 14, "en", baseValue)
  .includes("deals 1,166 base damage."), "The selected skill level must change the value");
assert.equal(skillDamageDescription("Deals …–… damage and restores …–… HP.", leapingSlam, 1, "en", baseValue),
  "Deals 70 base damage and restores …–… HP.", "Unrelated placeholders must stay untouched");

const protectionArmor = JSON.parse(await readFile(new URL("../public/data/reference/skill-damage/47.json", import.meta.url), "utf8")).skills["Skill:11720000"];
assert(protectionArmor, "Protection Armor healing data must be available");
assert.equal(skillDamageDescription("Restores …–… HP on Block.", protectionArmor, 1, "en", baseValue),
  "Restores 53–64 base HP on Block.");
assert.equal(skillDamageDescription("Restores …–… HP on Block.", protectionArmor, 14, "en", baseValue),
  "Restores 509–611 base HP on Block.");
assert.equal(skillDamageDescription("Restores …–… HP on Block.", protectionArmor, 41, "en", baseValue),
  "Restores …–… HP on Block.", "Unknown levels must remain unresolved");

const skillRecord = async (id) => {
  const chunk = createHash("sha256").update(id).digest("hex").slice(0, 2);
  return JSON.parse(await readFile(new URL(`../public/data/reference/skill-damage/${chunk}.json`, import.meta.url), "utf8")).skills[id];
};
const skillEntry = async (id) => {
  const chunk = createHash("sha256").update(id).digest("hex").slice(0, 2);
  return JSON.parse(await readFile(new URL(`../public/data/reference/skills/${chunk}.json`, import.meta.url), "utf8")).entries[id];
};
const deadshot = await skillRecord("Skill:14010020");
assert.deepEqual(deadshot.damageRanges, [["1401000011", "1401000311"]]);
assert(skillDamageDescription(deadshot.description, deadshot, 15, "en", baseValue)
  .includes("Deals 2,353–7,060 base damage"), "Separate native min/max effects must fill the same damage range");
const upgradedDeadshot = await skillRecord("Skill:14011350");
const upgradedDescription = skillDamageDescription(upgradedDeadshot.description, upgradedDeadshot, 15, "en", baseValue);
assert(upgradedDescription.includes("Deals 2,353–7,060 base damage"));
assert(upgradedDescription.includes("Deals 1,176–3,530 base extra damage"));
const damageWithDot = await skillRecord("Skill:12090250");
assert.deepEqual(damageWithDot.damageRanges, [["1209000011", "1209000311"], null]);
const damageWithDotText = skillDamageDescription(damageWithDot.description, damageWithDot, 15, "en", baseValue);
assert(damageWithDotText.includes("deals 4,968–14,904 base damage"));
assert(damageWithDotText.includes("Deals Damage over Time"), "Unknown DoT values must be omitted without truncating the sentence");
const vigilantEye = await skillRecord("Skill:14710000");
assert(skillDamageDescription((await skillEntry("Skill:14710000")).description, vigilantEye, 18, "en", baseValue)
  .includes("restores 1,041–1,249 base HP on Evasion"));
const crossguard = await skillRecord("Skill:18720000");
assert(skillDamageDescription((await skillEntry("Skill:18720000")).description, crossguard, 3, "en", baseValue)
  .includes("restores 87–96 base HP on Block"));
const crossguardVariant = await skillRecord("Skill:18720001");
assert(skillDamageDescription((await skillEntry("Skill:18720001")).description, crossguardVariant, 3, "en", baseValue)
  .includes("restores 87–96 base HP on Block"));
assert((await skillEntry("Skill:18710000")).description.includes("Heal Boost by 15.3% of Attack"));
assert((await skillEntry("Skill:17740000")).description.includes("Heal Boost by 22.4% of Attack"));
const drillDart = await skillRecord("Skill:14050000");
const drillDartText = skillDamageDescription(drillDart.description, drillDart, 17, "en", baseValue);
assert(drillDartText.includes("deals 1,331 base damage"));
assert(drillDartText.includes("dealing damage every 1s"));
assert(!drillDartText.includes("…-…"));

const colored = (text) => skillDescriptionParts(text).filter((part) => part.color).map(({ text: value, color }) => [value, color]);
assert.deepEqual(colored("Increases Critical Hit by 100 and Perfect Chance by 0.5%."), [
  ["Critical Hit", "text-amber-300"], ["100", "text-amber-300"],
  ["Perfect Chance", "text-amber-300"], ["0.5%", "text-amber-300"],
]);
assert.deepEqual(colored("PvE Damage Boost by 5.5%, PvP Damage Boost by 2.75%, Defense by 2%, and Accuracy by 100."), [
  ["PvE Damage Boost", "text-cyan-300"], ["5.5%", "text-cyan-300"],
  ["PvP Damage Boost", "text-violet-300"], ["2.75%", "text-violet-300"],
  ["Defense", "text-sky-300"], ["2%", "text-sky-300"],
  ["Accuracy", "text-sky-300"], ["100", "text-sky-300"],
]);
assert.deepEqual(colored("Increases Max Stamina by 15. Increases Move Speed by 10% for 1 s when attacked."), [
  ["Max Stamina", "text-lime-300"], ["15", "text-lime-300"],
  ["Move Speed", "text-lime-300"], ["10%", "text-lime-300"],
]);
assert.deepEqual(colored("PvE damage by 5%, PvP damage by 3%, and damage by 2%."), [
  ["PvE damage", "text-cyan-300"], ["5%", "text-cyan-300"],
  ["PvP damage", "text-violet-300"], ["3%", "text-violet-300"],
  ["damage", "text-rose-300"], ["2%", "text-rose-300"],
]);
assert.deepEqual(colored("Deals 479 base damage and restores 53–64 base HP."), [
  ["479", "text-rose-300"], ["damage", "text-rose-300"],
  ["53–64", "text-emerald-300"], ["HP", "text-emerald-300"],
]);

console.log("Skill descriptions show level-specific values and color complete stat names with their values.");
