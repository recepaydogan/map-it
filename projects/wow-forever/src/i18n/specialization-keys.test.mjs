import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { specializationKey } from "./specialization-keys.ts";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const source = read("../../public/data/locales/wow-forever/source.json");
const catalog = read("../../public/data/classes/catalog.json");

test("all class specialization headings resolve to available client names in eight languages", () => {
  const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  const packs = locales.map((locale) => read("../../public/data/locales/wow-forever/" + locale + ".json"));
  const aliases = { Shadow: "Shadow Magic", Elemental: "Elemental Combat", Feral: "Feral Combat" };
  let count = 0;
  for (const cls of catalog.classes) for (const tree of cls.trees) {
    const key = specializationKey(cls.id, tree.name);
    const index = source.keys.indexOf(key);
    assert.ok(index >= 0, cls.id + "/" + tree.name);
    assert.equal(source.values[index], aliases[tree.name] ?? tree.name);
    for (const [i, pack] of packs.entries()) assert.ok(pack.values[index], locales[i] + "/" + key);
    count += 1;
  }
  assert.equal(count, 27);
});

test("shared English labels retain their class-specific identity", () => {
  assert.equal(specializationKey("warrior", "Protection"), "SkillLine:257:0");
  assert.equal(specializationKey("paladin", "Protection"), "SkillLine:267:0");
  assert.equal(specializationKey("shaman", "Restoration"), "SkillLine:374:0");
  assert.equal(specializationKey("druid", "Restoration"), "SkillLine:573:0");
  assert.equal(specializationKey("unknown", "Protection"), undefined);
});
