import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("client Spell prose matches item effects without changing numeric meaning", async () => {
  const evidence = await read("data/item-effect-localization/client-spell-effect-matches.json");
  const german = await read("public/data/locales/wow-forever/item-effects-deDE.json");
  const spanish = await read("public/data/locales/wow-forever/item-effects-esES.json");
  const mexican = await read("public/data/locales/wow-forever/item-effects-esMX.json");
  const traditional = await read("public/data/locales/wow-forever/item-effects-zhTW.json");
  const scope = "Attaches a permanent scope to a bow or gun that increases its damage by 3.";
  assert.deepEqual(evidence.effects[scope].spellRefs, [{ id: 3976, field: 1 }]);
  assert.equal(german.translations[scope],
    "Verbindet ein Zielfernrohr dauerhaft mit dem Bogen oder der Schusswaffe und erhöht den damit zugefügten Schaden um 3.");
  assert.notEqual(spanish.translations[scope], mexican.translations[scope]);

  const dummy = "Drops a target dummy on the ground that attracts nearby monsters to attack it. Lasts for 15 seconds or until killed.";
  assert.ok(evidence.effects[dummy].translations.deDE.includes("15"));
  assert.equal(evidence.effects[dummy].translations.zhTW, undefined);
  assert.equal(traditional.translations[dummy],
    "在地上放置一個假人，吸引附近的怪物攻擊。持續15秒或直到被摧毀。");

  const formatted = "Allows opening of hard locks. The skeleton key is consumed in the process.";
  assert.equal(evidence.effects[formatted].clientEnglish[0],
    "Allows opening of hard locks.  The skeleton key is consumed in the process.");
  assert.ok(german.translations[formatted]);

  const flute = "Right Click to summon and dismiss Wimdy.";
  assert.deepEqual(evidence.effects[flute].spellRefs, [{ id: 1256151, field: 1 }]);
  assert.equal(evidence.effects["Right Click to summon and dismiss Diablo."], undefined);
  assert.equal(german.translations[flute], "Mit Rechtsklick Wimdy beschwören und freigeben.");
});
