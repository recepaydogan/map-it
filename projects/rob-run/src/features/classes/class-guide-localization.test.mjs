import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyClassGuideText } from "./class-guide-localization.ts";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const base = {
  guide: read("../../../public/data/classes/guides/class-guides.json").classes.Warrior,
  play: read("../../../public/data/classes/guides/warrior-play.json"),
  builds: read("../../../public/data/classes/guides/warrior-builds.json"),
  stats: read("../../../public/data/classes/guides/stats.json"),
};

test("all stat weight labels shown in class guides have locale entries", () => {
  const classes = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"];
  const classGuides = read("../../../public/data/classes/guides/class-guides.json");
  const usedStats = new Set();
  const collect = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "weights" && value && typeof value === "object") {
        Object.keys(value).forEach((stat) => usedStats.add(stat));
      } else collect(value);
    }
  };
  collect(classGuides);
  for (const name of classes) {
    const id = name.toLowerCase();
    collect(read(`../../../public/data/classes/guides/${id}-play.json`));
    collect(read(`../../../public/data/classes/guides/${id}-builds.json`));
  }
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    for (const name of classes) {
      const pack = read(`../../../public/data/classes/guides/locales/${language}/${name.toLowerCase()}.json`);
      const labels = new Map(pack.edits.filter((edit) => edit.path[0] === "stats")
        .map((edit) => [String(edit.path[1]), edit]));
      for (const stat of usedStats) {
        if (!Object.hasOwn(base.stats, stat)) continue; // dps and armor use UI locale keys.
        const edit = labels.get(stat);
        assert.ok(edit?.text?.trim(), `${language}/${name}: missing weight label ${stat}`);
        assert.equal(edit.source, base.stats[stat]);
      }
    }
  }
});

test("eight localized warrior packs replace prose without changing spell references or build data", () => {
  const original = JSON.stringify(base);
  const prosePaths = [];
  function visit(node, path) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const next = [...path, key];
      // Retired tips can leave empty source slots; only visible prose needs a translation.
      if (typeof value === "string" && value.trim() && (
        ["overview", "summary", "forever", "note", "notes", "why", "world", "battlegrounds", "title", "playstyle"].includes(key) ||
        path.at(-1) === "why" ||
        key === "role" && path[0] === "play" ||
        Array.isArray(node) && ["tips", "stats", "order"].includes(path.at(-1))
      )) prosePaths.push(next.join("."));
      else if (value && typeof value === "object") visit(value, next);
    }
  }
  for (const key of ["guide", "play", "builds"]) visit(base[key], [key]);
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const pack = read("../../../public/data/classes/guides/locales/" + language + "/warrior.json");
    const paths = new Set(pack.edits.map(edit => edit.path.join(".")));
    for (const path of prosePaths) assert.ok(paths.has(path), language + ": " + path);
    const result = applyClassGuideText(base, pack.edits);
    const opener = pack.edits.find((edit) => edit.path.join(".") === "guide.specs.0.rotation.opener.1.note");
    assert.equal(result.guide.specs[0].rotation.opener[1].note, opener.text);
    assert.equal(result.guide.specs[0].rotation.opener[1].spell, "Bloodrage");
    const restoredBuilds = structuredClone(result.builds);
    for (const edit of pack.edits.filter((edit) => edit.path[0] === "builds")) {
      const node = edit.path.slice(1, -1).reduce((node, part) => node[part], restoredBuilds);
      assert.equal(node[edit.path.at(-1)], edit.text);
      node[edit.path.at(-1)] = edit.source;
    }
    assert.deepEqual(restoredBuilds, base.builds);
    for (const [name, spec] of Object.entries(base.play.specs)) {
      for (const mode of ["pve", "pvp"]) {
        if (!spec[mode]?.stats?.order) continue;
        assert.equal(result.play.specs[name][mode].stats.order.length, spec[mode].stats.order.length);
      }
    }
    for (const edit of pack.edits) {
      const node = edit.path.slice(0, -1).reduce((node, part) => node[part], result);
      node[edit.path.at(-1)] = edit.source;
    }
    assert.deepEqual(result, base);
  }
  assert.equal(JSON.stringify(base), original);
});

test("stale or non-prose replacements fail instead of silently changing gameplay", () => {
  assert.throws(() => applyClassGuideText(base, [
    { path: ["guide", "specs", "0", "role"], source: base.guide.specs[0].role, text: "Translated role identifier" },
  ]), /Invalid/);
  assert.throws(() => applyClassGuideText(base, [
    { path: ["guide", "specs", "0", "tree"], source: "Arms", text: "Other" },
  ]), /Invalid/);
  assert.throws(() => applyClassGuideText(base, [
    { path: ["guide", "specs", "0", "rotation", "opener", "1", "spell"], source: "Bloodrage", text: "Other" },
  ]), /Invalid/);
  assert.throws(() => applyClassGuideText(base, [
    { path: ["guide", "specs", "0", "summary"], source: "outdated", text: "Translated" },
  ]), /Stale/);
  assert.throws(() => applyClassGuideText(base, [
    { path: ["__proto__", "summary"], source: "", text: "Translated" },
  ]), /Invalid/);
});

test("Hunter overview and all specialization play guides resolve client spells without changing mechanics", () => {
  const hunter = {
    guide: read("../../../public/data/classes/guides/class-guides.json").classes.Hunter,
    play: read("../../../public/data/classes/guides/hunter-play.json"),
    builds: read("../../../public/data/classes/guides/hunter-builds.json"),
    stats: base.stats,
  };
  const source = read("../../../public/data/locales/wow-forever/source.json");
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, code] of Object.entries(codes)) {
    const pack = read("../../../public/data/classes/guides/locales/" + language + "/hunter.json");
    const client = read("../../../public/data/locales/wow-forever/" + code + ".json");
    const paths = new Set(pack.edits.map(edit => edit.path.join(".")));
    assert.ok(paths.has("guide.overview"));
    const requireProse = (node, path) => {
      for (const [key, value] of Object.entries(node)) {
        const next = [...path, key];
        if (typeof value === "string" && value.trim() && (
          ["overview", "summary", "forever", "role", "note", "notes", "why", "battlegrounds", "world"].includes(key) ||
          Array.isArray(node) && ["tips", "stats", "order"].includes(path.at(-1))
        )) {
          if (!(key === "role" && path[0] === "guide")) assert.ok(paths.has(next.join(".")), `${language}: ${next.join(".")}`);
        } else if (value && typeof value === "object") requireProse(value, next);
      }
    };
    requireProse(hunter.guide, ["guide"]);
    requireProse(hunter.play.specs["Beast Mastery"].pve, ["play", "specs", "Beast Mastery", "pve"]);
    requireProse(hunter.play.specs["Beast Mastery"].pvp, ["play", "specs", "Beast Mastery", "pvp"]);
    requireProse(hunter.play.specs.Marksmanship.pve, ["play", "specs", "Marksmanship", "pve"]);
    requireProse(hunter.play.specs.Marksmanship.pvp, ["play", "specs", "Marksmanship", "pvp"]);
    requireProse(hunter.play.specs.Survival.pve, ["play", "specs", "Survival", "pve"]);
    requireProse(hunter.play.specs.Survival.pvp, ["play", "specs", "Survival", "pvp"]);
    requireProse(hunter.builds.specs["Beast Mastery"].rotations, ["builds", "specs", "Beast Mastery", "rotations"]);
    requireProse(hunter.builds.specs.Marksmanship.rotations, ["builds", "specs", "Marksmanship", "rotations"]);
    requireProse(hunter.builds.specs.Survival.rotations, ["builds", "specs", "Survival", "rotations"]);
    requireProse(hunter.builds.specs.Survival.rotations["20"].single, ["builds", "specs", "Survival", "rotations", "20", "single"]);
    requireProse(hunter.builds.specs.Survival.rotations["20"].aoe, ["builds", "specs", "Survival", "rotations", "20", "aoe"]);
    requireProse(hunter.builds.specs.Survival.rotations["30"].single, ["builds", "specs", "Survival", "rotations", "30", "single"]);
    requireProse(hunter.builds.specs.Survival.rotations["30"].aoe, ["builds", "specs", "Survival", "rotations", "30", "aoe"]);
    for (const [spec, data] of Object.entries(hunter.builds.specs)) {
      data.builds.forEach((build, index) => {
        const prefix = `builds.specs.${spec}.builds.${index}`;
        assert.ok(paths.has(`${prefix}.title`), `${language}: ${prefix}.title`);
        assert.ok(paths.has(`${prefix}.summary`), `${language}: ${prefix}.summary`);
        {
          for (const field of ["summary", "playstyle", ...Object.keys(build.why).map(id => `why.${id}`)]) {
            assert.ok(paths.has(`${prefix}.${field}`), `${language}: ${prefix}.${field}`);
          }
        }
      });
    }
    hunter.guide.specs.forEach((spec, i) => {
      assert.ok(paths.has(`guide.specs.${i}.summary`), language + ": " + spec.tree);
      spec.stats.forEach((_, j) => assert.ok(paths.has(`guide.specs.${i}.stats.${j}`), `${language}/${spec.tree}/${j}`));
    });
    const localized = applyClassGuideText(hunter, pack.edits);
    let links = 0;
    for (const edit of pack.edits) {
      assert.ok(edit.text.trim() && !edit.text.includes("{{"));
      for (const [, id, name] of edit.text.matchAll(/\[\[spell:(\d+)\|([^\]]+)\]\]/g)) {
        assert.equal(name, client.values[source.keys.indexOf("SpellName:" + id + ":0")]);
        links++;
      }
      const node = edit.path.slice(0, -1).reduce((node, key) => node[key], localized);
      node[edit.path.at(-1)] = edit.source;
    }
    assert.ok(links > 20, language);
    assert.deepEqual(localized, hunter);
  }
});

test("every Warrior level 20 and 30 build rotation has all prose fields in all locales", () => {
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const pack = read("../../../public/data/classes/guides/locales/" + language + "/warrior.json");
    const paths = new Set(pack.edits.map(edit => edit.path.join(".")));
    for (const spec of Object.keys(base.builds.specs)) for (const [level, rotation] of Object.entries(base.builds.specs[spec].rotations)) {
      const prefix = ["builds", "specs", spec, "rotations", level];
      assert.ok(paths.has([...prefix, "notes"].join(".")), `${language}/${spec}/${level} summary`);
      for (const group of ["single", "aoe"]) for (const [index] of rotation[group].entries()) {
        const path = [...prefix, group, index, "note"].join(".");
        assert.ok(paths.has(path), `${language}: ${path}`);
      }
    }
  }
});

for (const className of ["Paladin", "Rogue", "Mage", "Druid", "Priest", "Shaman", "Warlock"]) {
test(`${className} guide, gameplay and every build prose field is covered while mechanics remain unchanged`, () => {
  const classId = className.toLowerCase();
  const paladin = {
    guide: read("../../../public/data/classes/guides/class-guides.json").classes[className],
    play: read(`../../../public/data/classes/guides/${classId}-play.json`),
    builds: read(`../../../public/data/classes/guides/${classId}-builds.json`),
    stats: base.stats,
  };
  const prosePaths = [];
  function visit(node, path) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const next = [...path, key];
      if (typeof value === "string" && value.trim() && (
        ["overview", "summary", "forever", "note", "notes", "why", "world", "battlegrounds", "title", "playstyle"].includes(key) ||
        path.at(-1) === "why" ||
        key === "role" && path[0] === "play" ||
        Array.isArray(node) && ["tips", "stats", "order"].includes(path.at(-1))
      )) prosePaths.push(next.join("."));
      else if (value && typeof value === "object") visit(value, next);
    }
  }
  visit(paladin.guide, ["guide"]);
  for (const [spec, content] of Object.entries(paladin.play.specs)) {
    visit(content, ["play", "specs", spec]);
  }
  visit(paladin.builds, ["builds"]);
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const pack = read(`../../../public/data/classes/guides/locales/${language}/${classId}.json`);
    const paths = new Set(pack.edits.map(edit => edit.path.join(".")));
    for (const path of prosePaths) assert.ok(paths.has(path), language + ": " + path);
    const localized = applyClassGuideText(paladin, pack.edits);
    for (const edit of pack.edits) {
      assert.ok(edit.text.trim() && !edit.text.includes("{{"));
      const node = edit.path.slice(0, -1).reduce((node, key) => node[key], localized);
      const original = edit.path.reduce((node, key) => node[key], paladin);
      assert.ok(edit.source === original || edit.sources?.includes(original));
      node[edit.path.at(-1)] = original;
    }
    assert.deepEqual(localized, paladin);
  }
});
}

test("every guide spell link uses the current client name for its spell ID", () => {
  const source = read("../../../public/data/locales/wow-forever/source.json");
  const keyIndex = new Map(source.keys.map((key, index) => [key, index]));
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const classes = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
  for (const [language, code] of Object.entries(codes)) {
    const client = read(`../../../public/data/locales/wow-forever/${code}.json`);
    let links = 0;
    for (const classId of classes) {
      const guide = read(`../../../public/data/classes/guides/locales/${language}/${classId}.json`);
      for (const edit of guide.edits) {
        for (const [, id, label] of edit.text.matchAll(/\[\[spell:(\d+)\|([^\]]+)\]\]/g)) {
          const index = keyIndex.get(`SpellName:${id}:0`);
          assert.notEqual(index, undefined, `${language}/${classId}: missing spell ${id}`);
          assert.equal(label, client.values[index], `${language}/${classId}: stale spell ${id}`);
          links++;
        }
      }
    }
    assert.ok(links > 10000, `${language}: guide spell links missing`);
  }
});
