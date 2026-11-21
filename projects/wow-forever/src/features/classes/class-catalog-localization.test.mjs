import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { localizeClassCatalog } from "./class-catalog-localization.ts";

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("source-matched class descriptions replace English text in every locale", async () => {
  const catalog = await read("../../../public/data/classes/catalog.json");
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const pack = await read(`../../../public/data/classes/locales/${language}.json`);
    const localized = localizeClassCatalog(catalog, pack);
    const paladin = catalog.classes.find((entry) => entry.id === "paladin");
    const oath = paladin.trees.flatMap((tree) => tree.new).find((talent) => talent.name === "Oath of Light");
    const localizedOath = localized.classes.find((entry) => entry.id === "paladin")
      .trees.flatMap((tree) => tree.new).find((talent) => talent.name === "Oath of Light");
    assert.ok(pack.translations[oath.description]);
    assert.equal(localizedOath.description, pack.translations[oath.description]);
    assert.equal(paladin.trees.flatMap((tree) => tree.new)
      .find((talent) => talent.name === "Oath of Light").description, oath.description);
    for (const classId of ["warrior", "paladin", "hunter", "rogue", "mage", "warlock", "druid", "priest", "shaman"]) {
      const originalClass = catalog.classes.find((entry) => entry.id === classId);
      const translatedClass = localized.classes.find((entry) => entry.id === classId);
      for (const [index, tree] of originalClass.trees.entries()) {
        for (const [talentIndex, talent] of tree.new.entries()) {
          if (!talent.description || !pack.translations[talent.description]) continue;
          assert.notEqual(translatedClass.trees[index].new[talentIndex].description, talent.description,
            `${language}: ${talent.name} remains English`);
        }
      }
      for (const [index, ability] of originalClass.abilities.new.entries()) {
        if (!ability.description || !pack.translations[ability.description]) continue;
        assert.notEqual(translatedClass.abilities.new[index].description, ability.description,
          `${language}: ${ability.name} remains English`);
      }
    }
  }
});

test("a catalog from another content release still displays", async () => {
  const catalog = await read("../../../public/data/classes/catalog.json");
  const localized = localizeClassCatalog(catalog, { version: 1, translations: {
    "Unknown source description": "Translated",
  } });
  assert.equal(localized.classes[0].trees[0].new[0].description,
    catalog.classes[0].trees[0].new[0].description);
});
