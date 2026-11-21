import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("guide glossary keeps client terms and flags context-dependent names", async () => {
  const glossary = JSON.parse(await readFile(new URL("../data/client-research/guide-game-glossary.json", import.meta.url), "utf8"));
  const terms = new Map(glossary.terms.map((entry) => [entry.english, entry]));
  assert.equal(terms.get("Holy Light").localized.deDE, "Heiliges Licht");
  assert.equal(terms.get("High Order Skyborne").localized.frFR, "Éolide de l’Ordre suprême");
  assert.equal(terms.get("Windshaper Skyborne").localized.deDE, "Himmelsgeborener der Windformer");
  assert.equal(terms.get("Warrior").localized.deDE, null);
  assert.ok(terms.get("Warrior").guides.length > 0);
});
