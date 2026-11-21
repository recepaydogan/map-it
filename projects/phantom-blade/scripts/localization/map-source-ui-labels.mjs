/** App-authored source labels; item names and currency terminology remain native. */
import fs from "node:fs";
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const labels = {
  de: ["Truhe", "Truhen", "Beutefund", "Beutefunde", "Begegnungsbelohnung", "Begegnungsbelohnungen", "Questbelohnung", "Questbelohnungen"],
  fr: ["Coffre", "Coffres", "Objet à ramasser", "Objets à ramasser", "Récompense de combat", "Récompenses de combat", "Récompense de quête", "Récompenses de quête"],
  es: ["Cofre", "Cofres", "Botín para recoger", "Botín para recoger", "Recompensa de combate", "Recompensas de combate", "Recompensa de misión", "Recompensas de misión"],
  "es-419": ["Cofre", "Cofres", "Botín para recoger", "Botín para recoger", "Recompensa de combate", "Recompensas de combate", "Recompensa de misión", "Recompensas de misión"],
  it: ["Forziere", "Forzieri", "Bottino da raccogliere", "Bottini da raccogliere", "Ricompensa di combattimento", "Ricompense di combattimento", "Ricompensa di missione", "Ricompense di missione"],
  "pt-BR": ["Baú", "Baús", "Item para coletar", "Itens para coletar", "Recompensa de combate", "Recompensas de combate", "Recompensa de missão", "Recompensas de missão"],
  pt: ["Baú", "Baús", "Objeto para recolher", "Objetos para recolher", "Recompensa de combate", "Recompensas de combate", "Recompensa de missão", "Recompensas de missão"],
  ru: ["Сундук", "Сундуки", "Подбираемая добыча", "Подбираемая добыча", "Награда за бой", "Награды за бой", "Награда за задание", "Награды за задания"],
  ja: ["宝箱", "宝箱", "拾得品", "拾得品", "戦闘報酬", "戦闘報酬", "クエスト報酬", "クエスト報酬"],
  ko: ["상자", "상자", "획득 가능한 전리품", "획득 가능한 전리품", "전투 보상", "전투 보상", "퀘스트 보상", "퀘스트 보상"],
  th: ["หีบ", "หีบ", "ของที่เก็บได้", "ของที่เก็บได้", "รางวัลจากการต่อสู้", "รางวัลจากการต่อสู้", "รางวัลภารกิจ", "รางวัลภารกิจ"],
  vi: ["Rương", "Rương", "Vật phẩm nhặt được", "Vật phẩm nhặt được", "Phần thưởng chiến đấu", "Phần thưởng chiến đấu", "Phần thưởng nhiệm vụ", "Phần thưởng nhiệm vụ"],
  "zh-Hans": ["宝箱", "宝箱", "拾取物", "拾取物", "战斗奖励", "战斗奖励", "任务奖励", "任务奖励"],
  "zh-Hant": ["寶箱", "寶箱", "拾取物", "拾取物", "戰鬥獎勵", "戰鬥獎勵", "任務獎勵", "任務獎勵"],
};
const overridesFile = "data/localization/ui-context-overrides.json", overrides = read(overridesFile);
for (const { language, code } of read("public/data/locales/phantom-blade-zero/manifest.json").locales) {
  const native = read(`public/data/game-files/build-26266538/localization/${code}.json`).entries;
  const dust = native.find(row => row.namespace === "Default" && row.key === "UI_SkillWidget_13")?.text;
  if (!dust) throw new Error(`Missing native currency term ${language}`);
  const file = `src/i18n/locales/${language}.json`, locale = read(file);
  const values = labels[language];
  locale.wiki.creatureLoot.dust = dust;
  locale.wiki.groups.SceneDust = dust;
  locale.wiki.markerNames.SceneDust = dust;
  if (values) {
    for (const [i, group] of ["SceneContainer", "ScenePickup", "CombatReward", "FlowReward"].entries()) {
      locale.wiki.markerNames[group] = values[i * 2];
      locale.wiki.groups[group] = values[i * 2 + 1];
      (overrides[`wiki.markerNames.${group}`] ??= {})[language] = values[i * 2];
      (overrides[`wiki.groups.${group}`] ??= {})[language] = values[i * 2 + 1];
    }
    locale.wiki.containerObject = values[0];
    (overrides["wiki.containerObject"] ??= {})[language] = values[0];
  }
  for (const key of ["wiki.creatureLoot.dust", "wiki.groups.SceneDust", "wiki.markerNames.SceneDust"]) (overrides[key] ??= {})[language] = dust;
  fs.writeFileSync(file, JSON.stringify(locale, null, 2) + "\n");
}
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2) + "\n");
