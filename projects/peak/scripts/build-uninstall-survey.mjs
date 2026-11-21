import { readFileSync, writeFileSync } from "node:fs";

const locale = JSON.parse(readFileSync(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const target = new URL("./create-uninstall-survey.gs", import.meta.url);
const header = `/**
 * Peak Map — uninstall survey generator (Google Apps Script, NOT Node).
 * Generated from src/i18n/locales/en.json by npm run build:uninstall-survey.
 * Change survey wording in that locale file, then regenerate this artifact.
 *
 * 1. Open https://script.google.com and create a new project.
 * 2. Replace the sample code with this ENTIRE file and save.
 * 3. Run createUninstallSurvey and review Google's permission prompt.
 * 4. The execution log prints the PUBLIC respondent URL and EDIT URL.
 * 5. Verify responder access is "Anyone with the link" in the form editor.
 *    Test while signed out; Workspace policies may restrict public access.
 * 6. Paste the PUBLIC URL into SURVEY_URL in
 *    src/windows/uninstall/uninstall-entry.ts, then rebuild the app / OPK.
 *
 * Re-running creates a NEW form. It never modifies an existing survey.
 */
`;

// Serialized for Apps Script; this function is never executed in Node.
function createUninstallSurvey() {
  var copy = SURVEY_COPY;
  var form = FormApp.create(copy.title);
  form.setDescription(copy.description);
  form.setProgressBar(false);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setShuffleQuestions(false);

  form.addMultipleChoiceItem()
    .setTitle(copy.reason.title)
    .setRequired(true)
    .setChoiceValues(copy.reason.choices)
    .showOtherOption(true);
  form.addMultipleChoiceItem()
    .setTitle(copy.feature.title)
    .setRequired(false)
    .setChoiceValues(copy.feature.choices);
  form.addScaleItem()
    .setTitle(copy.experience.title)
    .setRequired(false)
    .setBounds(1, 10)
    .setLabels(copy.experience.low, copy.experience.high);
  form.addMultipleChoiceItem()
    .setTitle(copy.returnIntent.title)
    .setRequired(false)
    .setChoiceValues(copy.returnIntent.choices);
  form.addParagraphTextItem()
    .setTitle(copy.feedback.title)
    .setRequired(false)
    .setHelpText(copy.feedback.help);
  form.setConfirmationMessage(copy.confirmation);
  if (form.supportsAdvancedResponderPermissions()) form.setPublished(true);
  form.setAcceptingResponses(true);
  Logger.log("PUBLIC URL: %s", form.getPublishedUrl());
  Logger.log("EDIT URL: %s", form.getEditUrl());
  Logger.log("Set SURVEY_URL in src/windows/uninstall/uninstall-entry.ts, then rebuild.");
  Logger.log("Verify public access while signed out. Responses are in the form's Responses tab.");
}

const output = `${header}var SURVEY_COPY = ${JSON.stringify(locale.uninstallSurvey, null, 2)};\n\n${createUninstallSurvey.toString()}\n`;
if (process.argv.includes("--stdout")) {
  process.stdout.write(output);
} else if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8").replaceAll("\r\n", "\n");
  if (current !== output) throw new Error("Survey script is stale. Run npm run build:uninstall-survey.");
  console.log("Uninstall survey matches the English locale and generator.");
} else {
  writeFileSync(target, output);
  console.log("Generated scripts/create-uninstall-survey.gs");
}
