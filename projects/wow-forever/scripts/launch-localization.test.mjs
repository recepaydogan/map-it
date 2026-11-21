import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localizeTalentCatalog } from "../src/features/classes/talent-catalog-localization.ts";
import { applyClassGuideText } from "../src/features/classes/class-guide-localization.ts";
import { localizeClassCatalog } from "../src/features/classes/class-catalog-localization.ts";
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const root = "data/site-research/wowhead-check-2026-11-04/localization";
const inventory = await read(`${root}/inventory.json`);
const calc = await read("public/data/classes/talent-calculator.json");
const guides = await read(`${root}/guide-delta.json`);

test("all eight talent packs match every current talent and rank", async () => {
  for (const language of Object.keys(inventory.languages)) {
    const pack = await read(`public/data/classes/locales/talents-${language}.json`);
    const localized = localizeTalentCatalog(calc.classes, calc.sourceBuild, language, pack);
    for (const [c, cls] of calc.classes.entries()) for (const [t, tree] of cls.trees.entries()) for (const [a, talent] of tree.talents.entries()) {
      assert.ok(pack.entries[talent.id]?.name?.text);
      for (const [r, text] of talent.d.entries()) {
        assert.equal(pack.entries[talent.id].ranks[r].source, text);
        assert.notEqual(localized[c].trees[t].talents[a].d[r], text, `${language}/${talent.n}/${r}`);
      }
    }
  }
});
test("all 72 class guides apply without stale source paths or duplicated edits", async () => {
  for (const language of Object.keys(inventory.languages)) for (const [id, record] of Object.entries(guides)) {
    const pack = await read(`public/data/classes/guides/locales/${language}/${id}.json`);
    applyClassGuideText(record.data, pack.edits);
    assert.equal(new Set(pack.edits.map((e) => JSON.stringify(e.path.map(String)))).size, pack.edits.length);
    assert.ok(!pack.edits.some((e) => /Ferocious Bite.*(?:arrives at 32|comes at 32)/.test(e.source)));
  }
});
test("current class descriptions and new spell tooltips have translations in every locale", async () => {
  const catalog = await read("public/data/classes/catalog.json");
  const source = await read("public/data/locales/wow-forever/source.json");
  const ids = (await read("data/site-research/wowhead-check-2026-11-04/applied-update.json")).newSpellIds;
  for (const [language, locale] of Object.entries(inventory.languages)) {
    const localized = localizeClassCatalog(catalog, await read(`public/data/classes/locales/${language}.json`));
    for (const [i, cls] of catalog.classes.entries()) for (const [j, tree] of cls.trees.entries()) for (const [k, talent] of tree.new.entries()) {
      if (talent.description) assert.notEqual(localized.classes[i].trees[j].new[k].description, talent.description);
    }
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    const names = await read(`public/data/locales/wow-forever/${locale}.json`);
    assert.equal(source.keys.length, names.values.length);
    for (const id of ids) {
      assert.ok(pack.entries[id]?.d, `${language}/${id}`);
      assert.ok(names.values[source.keys.indexOf(`SpellName:${id}:0`)], `${language}/${id}/name`);
    }
    assert.ok(pack.entries[1329283].d.includes("15"));
    assert.ok(pack.entries[1329549].d.includes("25"));
    for (const [id, heal] of [[408521, "445"], [1239242, "575"], [1239243, "805"]]) {
      assert.ok(pack.entries[id].d.includes(heal), `${language}/Riptide/${id}`);
      assert.ok(!/486|534/.test(pack.entries[id].d), `${language}/old initial heal`);
    }
  }
});
test("the publish scope excludes the other agent's quest, marker and item packs", async () => {
  const scope = await read(`${root}/locale-scope.json`);
  assert.equal(scope.files.length, 147);
  assert.ok(scope.files.every((f) => !/\/(?:quest-|marker-|map-entity|item-)/.test(f.path)));
  for (const f of scope.files) assert.ok(f.localPath.startsWith("public/data/") || f.localPath.startsWith("src/i18n/locales/"));
});
