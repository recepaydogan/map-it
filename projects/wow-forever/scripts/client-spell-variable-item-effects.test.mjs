import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { matchNumericSpellTemplate, renderNumericSpellTemplate } from
  "./lib/match-client-spell-variable.mjs";

const read = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("numeric client Spell translations use the linked item and resolved values", async () => {
  const evidence = await read("data/item-effect-localization/client-spell-variable-effect-matches.json");
  const german = await read("public/data/locales/wow-forever/item-effects-deDE.json");
  const text = "Gives 10 additional stamina to party members within 30 yards.";
  const entry = evidence.effects[text];
  assert.deepEqual(entry.matches.map(({ itemId, spellId }) => [itemId, spellId]),
    [["10030", 12022]]);
  assert.deepEqual(matchNumericSpellTemplate(entry.matches[0].clientEnglish, text),
    { "$M1": "10", "$a1": "30" });
  assert.equal(german.translations[text],
    "Erhöht die Ausdauer aller Gruppenmitglieder im Umkreis von 30 Metern um 10.");

  const armor = "Permanently increase the Stamina value by 3 and armor value by 24 of an item worn on the chest, legs, hands or feet. Only usable on items level 15 and above.";
  assert.deepEqual(evidence.effects[armor].matches[0].values,
    { "$ec2": "3", "$ec1": "24", "$ecim": "15" });
  assert.ok(german.translations[armor].includes("24"));
  assert.deepEqual(matchNumericSpellTemplate(
    "Permanently increases armor by $ec1, and stamina by $ec2.",
    "Permanently increases armor by 24 and stamina by 3."),
  { "$ec1": "24", "$ec2": "3" });
  assert.equal(matchNumericSpellTemplate("Restores $s1 health.", "Restores 5 mana."), undefined);
  assert.equal(renderNumericSpellTemplate("Restores $s1 health.", { "$s2": "5" }), undefined);
});
