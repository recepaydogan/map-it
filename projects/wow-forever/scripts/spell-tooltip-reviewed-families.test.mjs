import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];

test("all player Thorns ranks retain their damage and duration in every locale", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const ids = reviewed.families.thorns.ids;
  assert.equal(ids.length, 6);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const source = shard[id].d;
      const damage = /causing (\d+) Nature damage/.exec(source)?.[1];
      const translated = pack.entries[id]?.d;
      assert.ok(damage && translated, `${locale} spell ${id}`);
      assert.ok(translated.includes(damage), `${locale} spell ${id} damage ${damage}`);
      assert.ok(translated.includes("10"), `${locale} spell ${id} duration`);
      assert.ok(!translated.includes("Thorns sprout"), `${locale} spell ${id} English fallback`);
    }
  }
});

test("all Life Tap ranks retain the health cost, mana gain, and Spirit coefficient", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const family = reviewed.families["life-tap"];
  const pattern = new RegExp(family.sourcePattern);
  assert.equal(family.ids.length, 6);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of family.ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const amount = pattern.exec(shard[id].d)?.groups?.amount;
      const translated = pack.entries[id]?.d;
      assert.ok(amount && translated, `${locale} spell ${id}`);
      assert.ok(translated.includes(amount), `${locale} spell ${id} amount ${amount}`);
      assert.ok(translated.includes("100%") || translated.includes("100 %"),
        `${locale} spell ${id} Spirit coefficient`);
      assert.ok(!translated.includes("(+100% of Spirit)"), `${locale} spell ${id} English fallback`);
    }
  }
});

for (const [name, expectedRanks, fields, sourceFragment] of [
  ["rip", 6, ["one", "two", "three", "four", "five"], "damage over 12 sec"],
  ["eviscerate", 9, ["oneMin", "oneMax", "twoMin", "twoMax", "threeMin", "threeMax", "fourMin", "fourMax", "fiveMin", "fiveMax"], "damage per combo point"],
]) {
  test(`all ${name} ranks retain combo-point damage in every locale`, async () => {
    const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
    const family = reviewed.families[name];
    assert.equal(family.ids.length, expectedRanks);
    const pattern = new RegExp(family.sourcePattern);
    for (const locale of locales) {
      const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
      for (const id of family.ids) {
        const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
        const source = shard[id].d;
        const captures = pattern.exec(source)?.groups;
        const translated = pack.entries[id]?.d;
        assert.ok(captures && translated, `${locale} spell ${id}`);
        for (const field of fields) {
          assert.ok(translated.includes(captures[field]), `${locale} spell ${id} ${field} ${captures[field]}`);
        }
        assert.ok(!translated.includes(sourceFragment), `${locale} spell ${id} English fallback`);
        assert.equal(translated.split("\n").length, 6, `${locale} spell ${id} combo-point rows`);
        if (name === "rip") {
          for (const row of translated.split("\n").slice(1)) {
            assert.match(row, /12/, `${locale} spell ${id} duration`);
          }
        }
      }
    }
  });
}

for (const [name, expectedRanks, fields, durationOrThreshold] of [
  ["execute", 5, ["base", "perRage"], "20"],
  ["lacerate", 3, ["damage"], "21"],
]) {
  test(`all ${name} ranks preserve their values in every locale`, async () => {
    const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
    const family = reviewed.families[name];
    assert.equal(family.ids.length, expectedRanks);
    const pattern = new RegExp(family.sourcePattern);
    for (const locale of locales) {
      const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
      for (const id of family.ids) {
        const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
        const captures = pattern.exec(shard[id].d)?.groups;
        const translated = pack.entries[id]?.d;
        assert.ok(captures && translated, `${locale} spell ${id}`);
        for (const field of fields) {
          assert.ok(translated.includes(captures[field]), `${locale} spell ${id} ${field}`);
        }
        assert.ok(translated.includes(durationOrThreshold), `${locale} spell ${id} duration or threshold`);
        assert.notEqual(translated, shard[id].d, `${locale} spell ${id} English fallback`);
      }
    }
  });
}

test("all Ice Barrier ranks retain absorb and Frost bonuses in every locale", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const family = reviewed.families["ice-barrier"];
  assert.equal(family.ids.length, 4);
  const pattern = new RegExp(family.sourcePattern);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of family.ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const absorb = pattern.exec(shard[id].d)?.groups?.absorb;
      const translated = pack.entries[id]?.d;
      assert.ok(absorb && translated, `${locale} spell ${id}`);
      assert.ok(translated.includes(absorb), `${locale} spell ${id} absorb`);
      assert.ok(translated.includes("10%") || translated.includes("10 %"), `${locale} spell ${id} Frost coefficient`);
      assert.equal((translated.match(/3%|3 %/g) ?? []).length, 2, `${locale} spell ${id} Frost bonuses`);
      assert.notEqual(translated, shard[id].d, `${locale} spell ${id} English fallback`);
    }
  }
});

test("shared spell descriptions translate every reviewed source ID with the same numbers", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  for (const [source, record] of Object.entries(reviewed.sharedDescriptions)) {
    const sourceNumbers = (source.match(/\d+/g) ?? []).sort();
    for (const locale of locales) {
      const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
      for (const id of record.ids) {
        const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
        assert.equal(shard[id].d, source, `${locale} spell ${id} source identity`);
        const translated = pack.entries[id]?.d;
        assert.ok(translated && translated !== source, `${locale} spell ${id} translation`);
        assert.deepEqual((translated.match(/\d+/g) ?? []).sort(), sourceNumbers,
          `${locale} spell ${id} numbers`);
      }
    }
  }
});

test("Classic Era comparison translates a matching spell description", async () => {
  const older = (await read("public/data/spells/foreverdb/1.json"))[705];
  const matchingCurrent = (await read(`public/data/spells/foreverdb/${350026 % 64}.json`))[350026];
  assert.equal(older.old, matchingCurrent.d);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    assert.ok(pack.entries[705]?.old, locale);
    assert.notEqual(pack.entries[705].old, older.old, locale);
    assert.match(pack.entries[705].old, /48.*56/, locale);
  }
});

test("Seal of Command ranks preserve Holy damage, Seal duration, and target condition", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const family = reviewed.families["seal-of-command"];
  assert.equal(family.ids.length, 5);
  const pattern = new RegExp(family.sourcePattern);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of family.ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const values = pattern.exec(shard[id].d)?.groups;
      const translated = pack.entries[id]?.d;
      assert.ok(values && translated, `${locale} spell ${id}`);
      for (const value of Object.values(values)) {
        assert.ok(translated.includes(value), `${locale} spell ${id} Holy damage ${value}`);
      }
      assert.ok(translated.includes("70") && translated.includes("30"), `${locale} spell ${id} Seal mechanics`);
      assert.notEqual(translated, shard[id].d, `${locale} spell ${id} English fallback`);
    }
  }
});

test("matching class catalog prose fills reviewed player spell descriptions", async () => {
  const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
  for (const [index, locale] of locales.entries()) {
    const classPack = await read(`public/data/classes/locales/${languages[index]}.json`);
    const spellPack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of [401859, 1324473]) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      assert.equal(spellPack.entries[id]?.d, classPack.translations[shard[id].d], `${locale} spell ${id}`);
    }
    const healingTouch = (await read(`public/data/spells/foreverdb/${17069 % 64}.json`))[17069];
    assert.ok(spellPack.entries[17069]?.d, `${locale} spell 17069`);
    assert.notEqual(spellPack.entries[17069].d, healingTouch.d, `${locale} spell 17069 English fallback`);
  }
  const korean = await read("public/data/locales/wow-forever/spell-tooltip-koKR.json");
  assert.ok(korean.entries[401859].d.includes("회복의 기원이"));
});

test("identical item effect prose fills spell descriptions without changing source identity", async () => {
  for (const locale of locales) {
    const effects = await read(`public/data/locales/wow-forever/item-effects-${locale}.json`);
    const spells = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of [8199, 8200, 8201]) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const source = shard[id].d;
      assert.equal(spells.entries[id]?.d, effects.translations[source], `${locale} spell ${id}`);
      assert.notEqual(spells.entries[id]?.d, source, `${locale} spell ${id} English fallback`);
    }
  }
});

test("duplicate spell records reuse only their identical translated description", async () => {
  for (const [target, sourceId] of [[1219968, 1214159], [1220032, 457548]]) {
    const targetShard = await read(`public/data/spells/foreverdb/${target % 64}.json`);
    const sourceShard = await read(`public/data/spells/foreverdb/${sourceId % 64}.json`);
    assert.equal(targetShard[target].d, sourceShard[sourceId].d);
    for (const locale of locales) {
      const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
      assert.equal(pack.entries[target]?.d, pack.entries[sourceId]?.d, `${locale} spell ${target}`);
      assert.notEqual(pack.entries[target]?.d, targetShard[target].d, `${locale} English fallback`);
    }
  }
});

test("duplicate aura and rank text reuse an identical localized field", async () => {
  const spanish = await read("public/data/locales/wow-forever/spell-tooltip-esES.json");
  for (const [field, target, sourceId] of [["a", 512, 1224315], ["r", 8199, 704]]) {
    const targetShard = await read(`public/data/spells/foreverdb/${target % 64}.json`);
    const sourceShard = await read(`public/data/spells/foreverdb/${sourceId % 64}.json`);
    assert.equal(targetShard[target][field], sourceShard[sourceId][field]);
    assert.equal(spanish.entries[target]?.[field], spanish.entries[sourceId]?.[field]);
    assert.notEqual(spanish.entries[target]?.[field], targetShard[target][field]);
  }
});

test("Seal of Righteousness ranks preserve damage, coefficients, and aura", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const families = [reviewed.families["seal-of-righteousness-base"],
    reviewed.families["seal-of-righteousness-judgement"]];
  assert.equal(families.flatMap((family) => family.ids).length, 8);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const family of families) for (const id of family.ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      const descriptionValues = new RegExp(family.sourcePattern).exec(shard[id].d)?.groups;
      const auraValues = new RegExp(family.auraSourcePattern).exec(shard[id].a)?.groups;
      const description = pack.entries[id]?.d;
      const aura = pack.entries[id]?.a;
      assert.ok(descriptionValues && auraValues && description && aura, `${locale} spell ${id}`);
      for (const value of Object.values(descriptionValues)) {
        assert.ok(description.includes(value), `${locale} spell ${id} damage ${value}`);
      }
      for (const value of Object.values(auraValues)) {
        assert.ok(aura.includes(value), `${locale} spell ${id} aura damage ${value}`);
      }
      for (const text of [description, aura]) {
        assert.match(text, /7[.,]65\s*%/, `${locale} spell ${id} low coefficient`);
        assert.match(text, /12\s*%/, `${locale} spell ${id} high coefficient`);
      }
      assert.ok(description.includes("30"), `${locale} spell ${id} duration`);
    }
  }
});

test("Classic Era tooltip translations preserve every source number", async () => {
  const shards = await Promise.all(Array.from({ length: 64 }, (_, shard) =>
    read(`public/data/spells/foreverdb/${shard}.json`)));
  const numbers = (value) => (value.replace(/(\p{L})\.(?=\d)/gu, "$1 ")
    .match(/(?:\d+(?:[.,]\d+)?|[.,]\d+)/g) ?? [])
    .map((number) => Number(number.replace(",", "."))).sort((a, b) => a - b);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const [id, entry] of Object.entries(pack.entries)) {
      if (!entry.old) continue;
      const source = shards[id % 64][id].old;
      assert.deepEqual(numbers(entry.old), numbers(source), `${locale} spell ${id} old numbers`);
    }
  }
});

test("reviewed Spanish Rupture ranks use the source's ten-second second combo point", async () => {
  const pack = await read("public/data/locales/wow-forever/spell-tooltip-esES.json");
  for (const id of [1943, 8639, 8640, 11273, 11274, 11275]) {
    for (const field of ["d", "old"]) {
      const text = pack.entries[id]?.[field];
      assert.ok(text, `esES spell ${id} ${field}`);
      assert.match(text, /^2 puntos: \d+ p\. de daño durante 10 s$/m,
        `esES spell ${id} ${field} second combo point`);
    }
  }
});

test("name-only spell descriptions use the same-ID game locale", async () => {
  const source = await read("public/data/locales/wow-forever/source.json");
  for (const locale of locales) {
    const game = await read(`public/data/locales/wow-forever/${locale}.json`);
    const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    for (const id of [437984, 437987, 1231844, 1231845]) {
      const index = source.keys.indexOf(`SpellName:${id}:0`);
      assert.equal(pack.entries[id]?.d, game.values[index], `${locale} spell ${id}`);
      assert.notEqual(pack.entries[id]?.d, source.values[index], `${locale} English fallback`);
    }
  }
});

test("mismatched client rank numbers are not copied", async () => {
  const german = await read("public/data/locales/wow-forever/spell-tooltip-deDE.json");
  assert.equal(german.entries[29206]?.r, "Rang 1");
});

test("reviewed Spanish aura corrections match the source effect", async () => {
  const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
  const spanish = await read("public/data/locales/wow-forever/spell-tooltip-esES.json");
  for (const [source, record] of Object.entries(reviewed.reviewedAuras)) {
    for (const id of record.ids) {
      const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
      assert.equal(shard[id].a, source, `spell ${id} aura source`);
      if (record.locales.esES) {
        assert.equal(spanish.entries[id]?.a, record.locales.esES, `spell ${id} Spanish aura`);
      } else {
        assert.ok(spanish.entries[id]?.a, `spell ${id} Spanish aura`);
        assert.notEqual(spanish.entries[id].a, source, `spell ${id} Spanish English fallback`);
      }
    }
  }
});

test("Spanish Enfeeble retains the curse mechanic in descriptions and aura", async () => {
  const spanish = await read("public/data/locales/wow-forever/spell-tooltip-esES.json");
  for (const id of [1288558, 1290040]) {
    const shard = await read(`public/data/spells/foreverdb/${id % 64}.json`);
    assert.match(shard[id].d, /deadly curse/);
    assert.match(spanish.entries[id]?.d, /maldición mortal/);
    assert.doesNotMatch(spanish.entries[id].d, /veneno/);
  }
  assert.match(spanish.entries[1290040]?.a, /maldición mortal/);
});
