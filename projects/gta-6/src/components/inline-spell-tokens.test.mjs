import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { splitSpellTokens } from "./inline-spell-tokens.ts";
import { classSpellIds, resolveClassGuideSpells, resolveGuideClassNames, resolveGuideMapNames, resolveGuideRaceNames, resolveGuideItemNames, resolveKoreanGuideParticles } from "../../scripts/lib/class-guide-spell-terms.mjs";

test("guide item names require the exact client item ID, name and source mention", () => {
  const source = { keys: ["ItemSparse:5514:4"], values: ["Mana Agate"] };
  const pack = { values: ["Manaachat"] };
  assert.equal(resolveGuideItemNames("Use {{ITEM:5514|Mana Agate}}.", "Use Mana Agate.", source, pack), "Use Manaachat.");
  assert.throws(() => resolveGuideItemNames("{{ITEM:5515|Mana Agate}}", "Mana Agate", source, pack), /Unverified/);
  assert.throws(() => resolveGuideItemNames("{{ITEM:5514|Other item}}", "Other item", source, pack), /Unverified/);
  assert.throws(() => resolveGuideItemNames("{{ITEM:5514|Mana Agate}}", "Unrelated", source, pack), /Unverified/);
  assert.throws(() => resolveGuideItemNames("{{ITEM:5514|Mana Agate}}", "Mana Agate", source, {values:[""]}), /Unverified/);
});

test("explicit spell links work next to CJK text and retain punctuation", () => {
  assert.deepEqual(splitSpellTokens("以[[spell:2457|战斗姿态]]起手，使用[[spell:78|英勇打击]]。"), [
    { text: "以" }, { id: 2457, name: "战斗姿态" }, { text: "起手，使用" },
    { id: 78, name: "英勇打击" }, { text: "。" },
  ]);
  for (const text of ["[[spell:0|invalid]]", "[[spell:9007199254740992|invalid]]", "[[spell:78|]]", "ordinary prose"]) {
    assert.deepEqual(splitSpellTokens(text), [{ text }]);
  }
});

test("Korean particles follow client labels without changing prose or non-Hangul names", () => {
  const labels = { "{{CLASS:Paladin}}": "성기사", "{{SPELL:Judgement}}": "[[spell:20271|심판]]", "{{SPELL:Heal}}": "[[spell:1|치유]]", "{{SPELL:Shield}}": "[[spell:2|보호막]]", "{{SPELL:Unknown}}": "Untranslated", "{{SPELL:Path}}": "[[spell:3|길]]" };
  const resolve = token => labels[token];
  assert.equal(resolveKoreanGuideParticles("{{CLASS:Paladin}}은 치유합니다.", resolve), "{{CLASS:Paladin}}는 치유합니다.");
  assert.equal(resolveKoreanGuideParticles("{{SPELL:Judgement}}를 사용하고 {{SPELL:Heal}}을 사용하세요.", resolve), "{{SPELL:Judgement}}을 사용하고 {{SPELL:Heal}}를 사용하세요.");
  assert.equal(resolveKoreanGuideParticles("{{SPELL:Shield}}로 보호하고 {{SPELL:Path}}으로 이동하세요.", resolve), "{{SPELL:Shield}}으로 보호하고 {{SPELL:Path}}로 이동하세요.");
  assert.equal(resolveKoreanGuideParticles("{{SPELL:Unknown}}을 사용. {{SPELL:Judgement}}이다. 일반 문장은 그대로.", resolve), "{{SPELL:Unknown}}을 사용. {{SPELL:Judgement}}이다. 일반 문장은 그대로.");
});

test("race terms use the canonical client name field and reject ambiguity", () => {
  const source = { keys: ["ChrRaces:8:1", "ChrRaces:8:2", "ChrRaces:31:11"], values: ["Troll", "Troll", "Troll"] };
  const pack = { values: ["Internal name", "트롤", "Other field"] };
  assert.equal(resolveGuideRaceNames("{{RACE:Troll}}", "Troll Priests", source, pack), "트롤");
  assert.throws(() => resolveGuideRaceNames("{{RACE:Troll}}", "Unrelated", source, pack), /Unverified/);
  assert.throws(() => resolveGuideRaceNames("{{RACE:Troll}}", "Troll", {keys:["ChrRaces:8:2","ChrRaces:9:2"],values:["Troll","Troll"]}, pack), /Unverified/);
});

test("explicit race IDs resolve duplicate names without accepting mismatched records", () => {
  const source = { keys: ["ChrRaces:1:2", "ChrRaces:33:2", "ChrRaces:3:2"], values: ["Human", "Human", "Dwarf"] };
  const pack = { values: ["Mensch", "Other human", "Zwerg"] };
  assert.throws(() => resolveGuideRaceNames("{{RACE:Human}}", "Human Priest", source, pack), /Unverified/);
  assert.equal(resolveGuideRaceNames("{{RACE:1|Human}}", "Human Priest", source, pack), "Mensch");
  assert.throws(() => resolveGuideRaceNames("{{RACE:3|Human}}", "Human Priest", source, pack), /Unverified/);
  assert.throws(() => resolveGuideRaceNames("{{RACE:1|Human}}", "Dwarf Priest", source, pack), /Unverified/);
});

test("class names accept ordinary prose capitalization and plurals but not substrings", () => {
  const source = { keys: ["ChrClasses:1:0"], values: ["Warrior"] };
  const pack = { values: ["전사"] };
  for (const original of ["any warrior:", "Warriors use Rage", "a Warrior's attacks"]) {
    assert.equal(resolveGuideClassNames("{{CLASS:Warrior}}", original, source, pack), "전사");
  }
  for (const original of ["Unrelated", "warriorship", "nonwarrior"]) {
    assert.throws(() => resolveGuideClassNames("{{CLASS:Warrior}}", original, source, pack), /Unverified/);
  }
  assert.throws(() => resolveGuideClassNames("{{CLASS:Warrior}}", "warrior", source, { values: [] }), /Unverified/);
  assert.throws(() => resolveGuideClassNames("{{CLASS:Warrior}}", "warrior",
    { keys: ["ChrClasses:1:0", "ChrClasses:2:0"], values: ["Warrior", "Warrior"] }, pack), /Unverified/);
});

test("spell resolution uses the class record and rejects unsupported source terms", () => {
  const ids = classSpellIds({ abilities: [{ n: "Strike", ranks: [{ id: 78 }] }], trees: [] });
  const source = { keys: ["SpellName:78:0"], values: ["Strike"] };
  assert.equal(resolveClassGuideSpells("Use {{SPELL:Strike}}", "Use Strike", ids, source, { values: ["打击"] }), "Use [[spell:78|打击]]");
  assert.throws(() => resolveClassGuideSpells("{{SPELL:Strike}}", "Unrelated prose", ids, source, { values: ["打击"] }), /Unverified/);
  assert.throws(() => resolveClassGuideSpells("{{SPELL:Strike}}", "Use Strike", ids, source, { values: [] }), /Unverified/);
  assert.throws(() => resolveClassGuideSpells("{{SPELL:Strike|Unrelated}}", "Unrelated prose", ids, source, { values: ["打击"] }), /Unverified/);
  assert.equal(resolveClassGuideSpells("{{SPELL:Sunder Armor|Sunder}}", "Use Sunder", new Map([["Sunder Armor", 7386]]),
    { keys: ["SpellName:7386:0"], values: ["Sunder Armor"] }, { values: ["破甲攻击"] }), "[[spell:7386|破甲攻击]]");
});

test("abbreviated Battle Stance requires the paired stance phrase", () => {
  const ids = new Map([["Battle Stance", 2457]]);
  const source = { keys: ["SpellName:2457:0"], values: ["Battle Stance"] };
  const pack = { values: ["战斗姿态"] };
  assert.equal(resolveClassGuideSpells("{{SPELL:Battle Stance|Battle}}", "Requires Battle or Berserker Stance", ids, source, pack), "[[spell:2457|战斗姿态]]");
  assert.throws(() => resolveClassGuideSpells("{{SPELL:Battle Stance|Battle}}", "Battle begins", ids, source, pack), /Unverified/);
});

test("abbreviated Bear Form requires druid context and the paired form phrase", () => {
  const source = { keys: ["SpellName:5487:0"], values: ["Bear Form"] };
  const pack = { values: ["곰 변신"] };
  const ids = new Map([["Bear Form", 5487]]);
  const others = new Map([["druid", ids]]);
  const token = "{{SPELL@druid:Bear Form|Bear}}";
  assert.equal(resolveClassGuideSpells(token, "switch to Bear or Cat Form", new Map(), source, pack, others), "[[spell:5487|곰 변신]]");
  assert.throws(() => resolveClassGuideSpells(token, "Bear", new Map(), source, pack, others), /Unverified/);
  assert.throws(() => resolveClassGuideSpells("{{SPELL:Bear Form|Bear}}", "Bear or Cat Form", ids, source, pack), /Unverified/);
});

test("paladin abbreviations require their specific source context", () => {
  const cases = [
    ["Blessing of Might", "Might", "Or Blessing of Kings if another Paladin covers Might"],
    ["Blessing of Might", "Might", "replace Blessing of Wisdom or Might"],
    ["Seal of Righteousness", "Righteousness", "judging Seal of Command or Righteousness does not consume it"],
    ["Seal of Command", "Command", "swap to it just after a swing to leave a Command Echo"],
    ...["Command", "Righteousness", "Fury", "Justice"].map((alias) =>
      ["Seal of " + alias, alias, "replacing Command, Righteousness, Fury or Justice leaves an Echo"]),
    ...["Wisdom", "Might"].map((alias) =>
      ["Blessing of " + alias, alias, "Wisdom for casters, Might for melee"]),
  ];
  for (const [name, alias, original] of cases) {
    const ids = new Map([[name, 1]]);
    const source = { keys: ["SpellName:1:0"], values: [name] };
    const pack = { values: ["Localized spell"] };
    const token = `{{SPELL:${name}|${alias}}}`;
    assert.equal(resolveClassGuideSpells(token, original, ids, source, pack), "[[spell:1|Localized spell]]");
    assert.throws(() => resolveClassGuideSpells(token, alias, ids, source, pack), /Unverified/);
  }
});

test("generated guide links match the installed client in all eight locales", () => {
  const read = (path) => JSON.parse(readFileSync(new URL("../../" + path, import.meta.url), "utf8"));
  const source = read("public/data/locales/wow-forever/source.json");
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, code] of Object.entries(codes)) {
    const locale = read("public/data/locales/wow-forever/" + code + ".json");
    const pack = read("public/data/classes/guides/locales/" + language + "/warrior.json");
    const specNote = pack.edits.find((edit) => edit.source.startsWith("Right after a swing lands;"));
    assert.ok(specNote.text.includes(locale.values[source.keys.indexOf("SkillLine:26:0")]));
    assert.ok(pack.edits.every((edit) => !edit.text.includes("{{")));
    for (const [spec, mapIds] of [["Arms", [2997, 1, 529, 489, 30]], ["Fury", [2997, 529]], ["Protection", [2997, 1, 529, 489, 30]]]) {
      const battlegrounds = pack.edits.find((edit) =>
        JSON.stringify(edit.path) === JSON.stringify(["play", "specs", spec, "pvp", "battlegrounds"]));
      assert.ok(battlegrounds, `${language}/${spec} battlegrounds`);
      for (const id of mapIds) {
        assert.ok(battlegrounds.text.includes(locale.values[source.keys.indexOf("Map:" + id + ":1")]));
      }
    }
    let links = 0;
    for (const edit of pack.edits) for (const part of splitSpellTokens(edit.text)) {
      if (!("id" in part)) continue;
      links++;
      assert.equal(part.name, locale.values[source.keys.indexOf("SpellName:" + part.id + ":0")]);
    }
    assert.ok(links >= 4, language);
  }
});

test("Paladin guide spell labels match client records including opponent abilities", () => {
  const read = (path) => JSON.parse(readFileSync(new URL("../../" + path, import.meta.url), "utf8"));
  const source = read("public/data/locales/wow-forever/source.json");
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, code] of Object.entries(codes)) {
    const locale = read("public/data/locales/wow-forever/" + code + ".json");
    const pack = read("public/data/classes/guides/locales/" + language + "/paladin.json");
    for (const edit of pack.edits) for (const part of splitSpellTokens(edit.text)) {
      if ("id" in part) assert.equal(part.name, locale.values[source.keys.indexOf("SpellName:" + part.id + ":0")]);
    }
    const control = pack.edits.find(e => e.path.join(".") === "play.specs.Holy.pvp.control.1.note");
    assert.equal(splitSpellTokens(control.text).filter(part => "id" in part).length, 5);
    const priest = pack.edits.find(e => e.path.join(".") === "play.specs.Holy.pvp.matchups.5.note");
    assert.ok(priest.text.includes(locale.values[source.keys.indexOf("ChrRaces:8:2")]));
    const nightElf = pack.edits.find(e => e.path.join(".") === "play.specs.Retribution.pvp.matchups.5.note");
    assert.ok(nightElf.text.includes(locale.values[source.keys.indexOf("ChrRaces:4:2")]));
    const battlegrounds = pack.edits.find(e => e.path.join(".") === "play.specs.Holy.pvp.battlegrounds");
    for (const id of [2997, 1, 529]) assert.ok(battlegrounds.text.includes(locale.values[source.keys.indexOf("Map:" + id + ":1")]));
  }
});

test("map terms require the exact named map rather than a same-name area", () => {
  const source = { keys: ["Map:529:1", "AreaTable:3358:1"], values: ["Arathi Basin", "Arathi Basin"] };
  const pack = { values: ["Map label", "Area label"] };
  assert.equal(resolveGuideMapNames("{{MAP:529|Arathi Basin}}", "Arathi Basin", source, pack), "Map label");
  assert.throws(() => resolveGuideMapNames("{{MAP:3358|Arathi Basin}}", "Arathi Basin", source, pack), /Unverified/);
});

test("opponent spells use their own class and cannot silently fall back to the current class", () => {
  const own = new Map([["Strike", 1]]);
  const others = new Map([["rogue", new Map([["Strike", 2]])]]);
  const source = { keys: ["SpellName:1:0", "SpellName:2:0"], values: ["Strike", "Strike"] };
  const pack = { values: ["Own strike", "Opponent strike"] };
  assert.equal(resolveClassGuideSpells("{{SPELL@rogue:Strike}}", "Strike", own, source, pack, others), "[[spell:2|Opponent strike]]");
  assert.throws(() => resolveClassGuideSpells("{{SPELL@mage:Strike}}", "Strike", own, source, pack, others), /Unverified/);
  const classSource = { keys: ["ChrClasses:4:0"], values: ["Rogue"] };
  assert.equal(resolveGuideClassNames("{{CLASS:Rogue}}", "Rogues", classSource, { values: ["Schurke"] }), "Schurke");
  assert.throws(() => resolveGuideClassNames("{{CLASS:Rogue}}", "Warriors", classSource, { values: ["Schurke"] }), /Unverified/);
});

test("class-independent perks require an exact client ID and source name", () => {
  const source = { keys: ["SpellName:1225501:0"], values: ["For Great Honor"] };
  const pack = { values: ["Localized perk"] };
  const original = "For Great Honor increases Honor gains";
  assert.equal(resolveClassGuideSpells("{{CLIENT:SpellName:1225501:0|For Great Honor}}", original, new Map(), source, pack),
    "[[spell:1225501|Localized perk]]");
  assert.throws(() => resolveClassGuideSpells("{{CLIENT:SpellName:1225502:0|For Great Honor}}", original, new Map(), source, pack), /Unverified/);
  assert.throws(() => resolveClassGuideSpells("{{CLIENT:SpellName:1225501:0|Other perk}}", "Other perk", new Map(), source, pack), /Unverified/);
});
