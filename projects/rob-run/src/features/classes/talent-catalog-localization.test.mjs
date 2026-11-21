import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localizeTalentCatalog } from "./talent-catalog-localization.ts";

const root = new URL("../../../public/data/classes/", import.meta.url);
const source = JSON.parse(await readFile(new URL("talent-calculator.json", root)));
const german = JSON.parse(await readFile(new URL("locales/talents-de.json", root)));
const warrior = (classes) => classes.find((entry) => entry.n === "Warrior");
const heroicStrike = (classes) => warrior(classes).trees.flatMap((tree) => tree.talents)
  .find((talent) => talent.id === 105958);

test("localized talent ranks keep their own values without mutating English source", () => {
  const localized = localizeTalentCatalog(source.classes, source.sourceBuild, "de", german);
  const talent = heroicStrike(localized);
  assert.equal(talent.n, "Verbesserter heldenhafter Stoß");
  assert.match(talent.d[0], /1 Wut/);
  assert.match(talent.d[1], /2 Wut/);
  assert.match(talent.d[2], /3 Wut/);
  assert.equal(heroicStrike(source.classes).n, "Improved Heroic Strike");
  assert.match(heroicStrike(source.classes).d[1], /2 Rage/);
});

test("a stale talent source is rejected", () => {
  const stale = structuredClone(german);
  stale.entries[105958].ranks[1].source = "An unrelated rank";
  assert.throws(() => localizeTalentCatalog(source.classes, source.sourceBuild, "de", stale),
    /Stale talent rank/);
});

test("Wowhead talent text applies only to the matching rank", () => {
  const localized = localizeTalentCatalog(source.classes, source.sourceBuild, "de", german);
  const talent = (classes) => classes.find((entry) => entry.n === "Paladin")
    .trees.flatMap((tree) => tree.talents).find((entry) => entry.id === 105324);
  assert.equal(talent(localized).d[0], talent(source.classes).d[0]);
  assert.match(talent(localized).d[1], /8%/);
  assert.match(talent(localized).d[1], /20%/);
  assert.notEqual(talent(localized).d[1], talent(source.classes).d[1]);
});
