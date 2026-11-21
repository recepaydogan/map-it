import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";

const script = readFileSync(new URL("../create-uninstall-survey.gs", import.meta.url), "utf8");

test("standalone Apps Script stays synchronized with locale and generator", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../build-uninstall-survey.mjs", import.meta.url)), "--check"]);
});

for (const advanced of [true, false]) {
  test(`creates five Peak questions with private responses (advanced publishing: ${advanced})`, () => {
    const items = [];
    const settings = {};
    const logs = [];
    const form = {};
    for (const method of ["setDescription", "setProgressBar", "setCollectEmail", "setAllowResponseEdits", "setLimitOneResponsePerUser", "setPublishingSummary", "setShowLinkToRespondAgain", "setShuffleQuestions", "setConfirmationMessage", "setPublished", "setAcceptingResponses"]) {
      form[method] = (value) => { settings[method] = value; return form; };
    }
    for (const type of ["MultipleChoice", "Scale", "ParagraphText"]) {
      form[`add${type}Item`] = () => {
        const data = { type };
        const item = {};
        for (const method of ["setTitle", "setRequired", "setChoiceValues", "showOtherOption", "setBounds", "setLabels", "setHelpText"]) {
          item[method] = (...args) => { data[method] = args.length === 1 ? args[0] : args; return item; };
        }
        items.push(data);
        return item;
      };
    }
    form.supportsAdvancedResponderPermissions = () => advanced;
    form.getPublishedUrl = () => "https://example.test/viewform";
    form.getEditUrl = () => "https://example.test/edit";
    const context = vm.createContext({
      FormApp: { create(title) { assert.equal(title, "Peak Map — Before You Go"); return form; } },
      Logger: { log: (...args) => logs.push(args) },
    });
    vm.runInContext(`${script}\ncreateUninstallSurvey();`, context);
    assert.equal(items.length, 5);
    assert.equal(items.filter((item) => item.setRequired).length, 1);
    assert.equal(items[0].showOtherOption, true);
    assert.equal(items[4].type, "ParagraphText");
    assert.equal(JSON.stringify(items[2].setBounds), "[1,10]");
    assert.equal(settings.setCollectEmail, false);
    assert.equal(settings.setLimitOneResponsePerUser, false);
    assert.equal(settings.setPublishingSummary, false);
    assert.equal(settings.setAcceptingResponses, true);
    assert.equal(settings.setPublished, advanced ? true : undefined);
    assert.equal(logs[0][1], form.getPublishedUrl());
    assert.equal(logs[1][1], form.getEditUrl());
    assert.doesNotMatch(JSON.stringify(items), /Valheim|Elden Ring|Nightreign/);
  });
}
