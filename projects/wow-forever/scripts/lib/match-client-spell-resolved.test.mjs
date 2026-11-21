import assert from "node:assert/strict";
import test from "node:test";
import { matchLinkedSpellTemplate, matchResolvedSpellTemplate, renderResolvedSpellTemplate } from
  "./match-client-spell-resolved.mjs";

test("matches linked Spell variables while preserving numbers, ranges, and duration", () => {
  assert.deepEqual(matchResolvedSpellTemplate(
    "Absorbs $s1 damage for $d. If this shield expires before $d, $1291099s1 Nature damage will be dealt to all enemies in melee range.",
    "Absorbs 450 damage for 15 sec. If this shield expires before 15 sec, 90 to 110 Nature damage will be dealt to all enemies in melee range."),
  { $s1: "450", $d: "15 sec", $1291099s1: "90 to 110" });
  assert.deepEqual(matchResolvedSpellTemplate(
    "Deals $s1 Holy damage every time you block.",
    "Deals 13 to 15 Holy damage every time you block."),
  { $s1: "13 to 15" });
  assert.deepEqual(matchResolvedSpellTemplate(
    "Places an Alchemy Laboratory. All camping features share a cooldown of $1308027d.",
    "Places an Alchemy Laboratory. All camping features share a cooldown of 1 hr."),
  { $1308027d: "1 hr" });
});

test("resolves uppercase scaled Spell variables from the installed client", () => {
  const source = "Reduces the casting time of your Fireball and Frostfire Bolt spells by 0.1 sec.";
  const template = "Reduces the casting time of your Fireball and Frostfire Bolt spells by $/1000;S1 sec.";
  const values = matchLinkedSpellTemplate(template, source);
  assert.deepEqual(values, { "$/1000;S1": "0.1" });
  assert.equal(renderResolvedSpellTemplate(
    "Verringert die Zauberzeit von Feuerball und Frostfeuerblitz um $/1000;S1 Sek.",
    values, "deDE", source),
  "Verringert die Zauberzeit von Feuerball und Frostfeuerblitz um 0,1 Sek.");
});

test("matches duration values written as days or until cancelled", () => {
  assert.deepEqual(matchLinkedSpellTemplate(
    "Increases mounted speed by $s1% for $d.",
    "Increases mounted speed by 10% for 15 days."),
  { $s1: "10", $d: "15 days" });
  assert.deepEqual(matchLinkedSpellTemplate(
    "The aura lasts $d.", "The aura lasts until cancelled."),
  { $d: "until cancelled" });
  assert.equal(matchLinkedSpellTemplate(
    "The aura lasts $d.", "The aura lasts until the player moves."), undefined);
});

test("rejects unrelated prose and inconsistent repeated variables", () => {
  assert.equal(matchResolvedSpellTemplate("Restores $s1 health.", "Restores 5 mana."), undefined);
  assert.equal(matchResolvedSpellTemplate("Absorbs $s1 damage, then $s1 damage.",
    "Absorbs 5 damage, then 6 damage."), undefined);
});

test("matches exact prose through the item's linked Spell identity", () => {
  assert.deepEqual(matchLinkedSpellTemplate("Teleport.", "Teleport."), {});
  assert.equal(matchLinkedSpellTemplate("Teleport.", "Teleports."), undefined);
  assert.deepEqual(matchLinkedSpellTemplate(
    "Fill the Amethyst Phial at the Oracle Glade moonwell.",
    "Fill the Amethyst Phial at the Oracle Glade moonwell."), {});
  assert.equal(matchLinkedSpellTemplate("Fill the Phial at the Oracle Glade moonwell.",
    "Fill the Amethyst Phial at the Oracle Glade moonwell."), undefined);
  assert.equal(renderResolvedSpellTemplate("Die Amethystphiole am Mondbrunnen füllen.",
    {}, "deDE"), "Die Amethystphiole am Mondbrunnen füllen.");
});

test("matches client abbreviations and English plural macros", () => {
  assert.deepEqual(matchLinkedSpellTemplate(
    "Cause party members within $a1 yds to regenerate $s1 health every 5 sec.",
    "Cause party members within 30 yards to regenerate 4 health every 5 sec."),
  { $a1: "30", $s1: "4" });
  assert.deepEqual(matchLinkedSpellTemplate(
    "Combine $s4 Illusion Dust and $s5 Righteous $LOrb:Orbs; at a Mote of Possibility.",
    "Combine 15 Illusion Dust and 1 Righteous Orb at a Mote of Possibility."),
  { $s4: "15", $s5: "1" });
  assert.deepEqual(matchLinkedSpellTemplate(
    "Target is cured of diseases up to level 35. Not usable in combat.",
    "Target is cured of diseases up to level 35. Not useable in combat."), {});
  const food = matchLinkedSpellTemplate(
    "Conjures $s1 $lmuffin:muffins;, providing the mage and $ghis:her; allies with something to eat.\r\n\r\nConjured items disappear if logged out for more than 15 minutes.",
    "Conjures 2 muffins, providing the mage and his/her allies with something to eat.\n\nConjured items disappear if logged out for more than 15 minutes.");
  assert.deepEqual(food, { $s1: "2" });
  assert.equal(renderResolvedSpellTemplate(
    "Zaubert $s1 $lMuffin:Muffins; herbei und versorgt den Magier sowie seine Verbündeten mit etwas Essbarem.\r\n\r\nHerbeigezauberte Gegenstände verschwinden, wenn Ihr Euch länger als 15 Minuten ausloggt.",
    food, "deDE"),
  "Zaubert 2 Muffins herbei und versorgt den Magier sowie seine Verbündeten mit etwas Essbarem.\n\nHerbeigezauberte Gegenstände verschwinden, wenn Ihr Euch länger als 15 Minuten ausloggt.");
  assert.equal(renderResolvedSpellTemplate("法师和$g他:她;的盟友可以食用$s1块魔法松饼。", food,
    "zhCN", "The mage and his/her allies can eat 2 muffins."),
  "法师和他/她的盟友可以食用2块魔法松饼。");
  assert.equal(renderResolvedSpellTemplate("法师和$g他:她;的盟友可以食用$s1块魔法松饼。", food,
    "zhCN"), undefined);
});

test("resolves installed client conditional and scaled spell values without changing mechanics", () => {
  const shield = matchLinkedSpellTemplate(
    "Draws on the soul of the party member to shield them, absorbing $?a14748[${$s1*(1+$14748s1/100)}][$s1] damage.  Lasts $d.  While the shield holds, spellcasting will not be interrupted by damage.  Once shielded, the target cannot be shielded again for $6788d.",
    "Draws on the soul of the party member to shield them, absorbing 44 damage.  Lasts 30 sec.  While the shield holds, spellcasting will not be interrupted by damage.  Once shielded, the target cannot be shielded again for 15 sec.");
  assert.deepEqual(shield, {
    "$?a14748[${$s1*(1+$14748s1/100)}][$s1]": "44", $d: "30 sec", $6788d: "15 sec",
  });
  assert.equal(renderResolvedSpellTemplate(
    "吸收$?a14748[${$s1*(1+$14748s1/100)}][$s1]点伤害。持续$d。目标在$6788d内无法再次受到护盾保护。",
    shield, "zhCN"), "吸收44点伤害。持续30秒。目标在15秒内无法再次受到护盾保护。");
  const charge = matchLinkedSpellTemplate(
    "Charge an enemy, generate $/10;s2 Rage, and Stun it for $7922d.  Cannot be used in combat.",
    "Charge an enemy, generate 9 Rage, and Stun it for 1 sec.  Cannot be used in combat.");
  assert.deepEqual(charge, { "$/10;s2": "9", $7922d: "1 sec" });
  assert.equal(renderResolvedSpellTemplate(
    "Stürmt auf einen Gegner zu, erzeugt $/10;s2 Wut und betäubt ihn für $7922d. Kann nicht im Kampf verwendet werden.",
    charge, "deDE"),
  "Stürmt auf einen Gegner zu, erzeugt 9 Wut und betäubt ihn für 1 Sek. Kann nicht im Kampf verwendet werden.");
  const stance = matchLinkedSpellTemplate(
    "A defensive combat stance.  Decreases damage taken by $7376s1% and damage caused by $7376s2%.  Increases all threat generated by $?a12792[${($7376s3+100)*($12792s1/100+1)-100)}.1%][$7376s3%].",
    "A defensive combat stance.  Decreases damage taken by 10% and damage caused by 10%.  Increases all threat generated by 30%.");
  assert.deepEqual(stance, {
    $7376s1: "10", $7376s2: "10",
    "$?a12792[${($7376s3+100)*($12792s1/100+1)-100)}.1%][$7376s3%]": "30%",
  });
  assert.equal(renderResolvedSpellTemplate(
    "Une posture de combat défensive. Réduit les dégâts subis de $7376s1 % et les dégâts infligés de $7376s2 %. Augmente le niveau de menace généré de $?a12792[${($7376s3+100)*($12792s1/100+1)-100)}.1 %][$7376s3 %].",
    stance, "frFR"),
  "Une posture de combat défensive. Réduit les dégâts subis de 10 % et les dégâts infligés de 10 %. Augmente le niveau de menace généré de 30 %.");
  const ward = matchLinkedSpellTemplate(
    "Absorbs $s1 Fire damage$?s11094[ and grants a $s2% chance to reflect Fire spells and effects][].  Lasts $d.",
    "Absorbs 162 Fire damage. Lasts 30 sec.");
  assert.deepEqual(ward, { $s1: "162", $d: "30 sec" });
  assert.equal(renderResolvedSpellTemplate(
    "Absorbiert $s1 Feuerschaden$?s11094[ und gewährt Euch eine Chance von $s2%, Feuerzauber und -effekte zurückzuwerfen][]. Hält $d lang an.",
    ward, "deDE"), "Absorbiert 162 Feuerschaden. Hält 30 Sek. lang an.");
  const roots = matchLinkedSpellTemplate(
    "Roots the target in place and causes $o2 Nature damage over $d.  Damage caused may interrupt the effect.  You may $?s17245[have up to ${$17245m1+1} $ltarget:targets;][only have 1 target] Rooted at a time.",
    "Roots the target in place and causes 20 Nature damage over 12 sec.  Damage caused may interrupt the effect.  You may only have 1 target Rooted at a time.");
  assert.deepEqual(roots, { $o2: "20", $d: "12 sec" });
  assert.equal(renderResolvedSpellTemplate(
    "Lässt das Ziel an Ort und Stelle festwurzeln und verursacht im Verlauf von $d insgesamt $o2 Naturschaden. Erlittener Schaden kann den Effekt unterbrechen. Ihr könnt $?s17245[bis zu ${$17245m1+1} $lZiel:Ziele;][nur ein Ziel] gleichzeitig festwurzeln.",
    roots, "deDE"),
  "Lässt das Ziel an Ort und Stelle festwurzeln und verursacht im Verlauf von 12 Sek. insgesamt 20 Naturschaden. Erlittener Schaden kann den Effekt unterbrechen. Ihr könnt nur ein Ziel gleichzeitig festwurzeln.");
});

test("renders client word order, duration, ranges, and plural forms", () => {
  const values = { $s1: "450", $d: "15 sec", $1291099s1: "90 to 110" };
  assert.equal(renderResolvedSpellTemplate(
    "Absorbiert $d lang $s1 Schaden. Fügt $1291099s1 Naturschaden zu.",
    values, "deDE"),
  "Absorbiert 15 Sek. lang 450 Schaden. Fügt 90 bis 110 Naturschaden zu.");
  assert.equal(renderResolvedSpellTemplate("Inflige $s1 $lpoint:points; de dégâts.",
    { $s1: "13 to 15" }, "frFR"), "Inflige 13 à 15 points de dégâts.");
  assert.equal(renderResolvedSpellTemplate("Inflige $s1 $lpoint:points; de dégâts.",
    { $s1: "1" }, "frFR"), "Inflige 1 point de dégâts.");
  assert.equal(renderResolvedSpellTemplate("$d 동안 지속됩니다.",
    { $d: "30 sec" }, "koKR"), "30초 동안 지속됩니다.");
  assert.equal(renderResolvedSpellTemplate("Heilt $s1 Punkt(e) Schaden für $d.",
    { $s1: "35", $d: "10 min" }, "deDE"),
  "Heilt 35 Punkte Schaden für 10 Min.");
  assert.equal(renderResolvedSpellTemplate("Nur alle $d Sek. möglich.",
    { $d: "10 sec" }, "deDE"), "Nur alle 10 Sek. möglich.");
  assert.equal(renderResolvedSpellTemplate("Solo cada $d s.",
    { $d: "10 sec" }, "esES"), "Solo cada 10 s.");
  assert.equal(renderResolvedSpellTemplate("每$d秒。",
    { $d: "10 sec" }, "zhCN"), "每10秒。");
  assert.equal(renderResolvedSpellTemplate("Absorbe $s2 dégâts.",
    { $s1: "5" }, "frFR"), undefined);
});
