import assert from "node:assert/strict";
import test from "node:test";
import { extractWowheadQuestObjective, isEnglishQuestProseFallback,
  stripWowheadQuestChrome } from "./wowhead-quest-prose-page.mjs";

test("reads only the quest objective beneath the localized title", () => {
  assert.equal(extractWowheadQuestObjective(
    "# A Quest\n\nSpeak with Talaanis in Valanaar.\n\n## Description\nOther text"),
  "Speak with Talaanis in Valanaar.");
  assert.equal(extractWowheadQuestObjective(
    "# 퀘스트\n발라나르에서 탈라니스와 대화해야 합니다.\n\n## 서술"),
  "발라나르에서 탈라니스와 대화해야 합니다.");
  assert.equal(extractWowheadQuestObjective("# A Quest\n\n| Page navigation |"), undefined);
});

test("keeps quest prose and removes reader tables and page controls", () => {
  assert.equal(stripWowheadQuestChrome("Pay two gold pieces.\n|  | Required money: 2(1) |\n| --- |"),
    "Pay two gold pieces.");
  assert.equal(stripWowheadQuestChrome("A reward awaits.\n\n See if you've already completed this by typing:  \n/run print(C_QuestLog.IsQuestFlaggedCompleted(8979))"),
    "A reward awaits.\n");
  assert.equal(stripWowheadQuestChrome("The guide is here.\n\nGather info with the Wowhead Client\nDownload Now"),
    "The guide is here.\n");
  assert.equal(stripWowheadQuestChrome("Fight in the Barrens.\nThen return to camp."),
    "Fight in the Barrens.\nThen return to camp.");
});

test("removes localized completion controls without removing quest prose", () => {
  const controls = [
    "Wenn du Folgendes im Spiel eingibst, kannst du überprüfen, ob du das schon abgeschlossen hast:",
    "Comprueba si ya lo has completad escribiendo:",
    "Vérifiez si vous l'avez déjà terminé en tapant :",
    "이미 완료했는지 확인하려면 다음과 같이 입력하세요:",
    "Veja se já completou isto escrevendo:",
    "输入以下代码查看此任务是否已完成",
    "輸入以下代碼查看此任務是否已完成",
  ];
  for (const control of controls) {
    const prose = `A quest paragraph.\n\n ${control}\n/run print(C_QuestLog.IsQuestFlaggedCompleted(9024))`;
    assert.equal(stripWowheadQuestChrome(prose).trim(), "A quest paragraph.");
    assert.equal(stripWowheadQuestChrome(`A quest paragraph.\n\n ${control}`).trim(),
      "A quest paragraph.");
  }
});

test("does not treat bracketed English quest prose as a translation", () => {
  const english = "Travel to the Emerald Dream.\nRetrieve the Shadowscythe.";
  assert.equal(isEnglishQuestProseFallback(
    "[Travel to the Emerald Dream.\n\nRetrieve the Shadowscythe.]", english), true);
  assert.equal(isEnglishQuestProseFallback(
    "[Reist in den Smaragdgrünen Traum.]", english), false);
  assert.equal(isEnglishQuestProseFallback(
    "[Bring the orb to <nombre> in Stormwind.]",
    "Bring the orb to <name> in Stormwind."), true);
  assert.equal(isEnglishQuestProseFallback(
    "[Apporta l'orbe à <nom> à Hurlevent.]",
    "Bring the orb to <name> in Stormwind."), false);
});
