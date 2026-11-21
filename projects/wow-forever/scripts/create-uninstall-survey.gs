/**
 * Google Apps Script template for the uninstall survey.
 * Run `npm run build:uninstall-survey`, then paste the generated
 * uninstall-survey.local/create-uninstall-survey.gs into script.google.com.
 * Run createUninstallSurvey once; each run creates a new Google Form.
 */
function createUninstallSurvey() {
  var config = __SURVEY_CONFIG__;
  var copy = config.copy;
  var formatText = function (value) {
    return value.replace(/\{\{app\}\}/g, config.appName)
      .replace(/\{\{game\}\}/g, config.gameName);
  };
  var form = FormApp.create(formatText(copy.title));

  form.setDescription(formatText(copy.description));
  form.setProgressBar(false);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setShuffleQuestions(false);

  form.addMultipleChoiceItem()
    .setTitle(copy.mainReason)
    .setRequired(true)
    .setChoiceValues(Object.values(copy.reasons).map(formatText))
    .showOtherOption(true);

  form.addMultipleChoiceItem()
    .setTitle(copy.mostUsed)
    .setRequired(false)
    .setChoiceValues(Object.values(copy.features))
    .showOtherOption(true);

  form.addScaleItem()
    .setTitle(copy.experience)
    .setRequired(false)
    .setBounds(1, 10)
    .setLabels(copy.poor, copy.great);

  form.addMultipleChoiceItem()
    .setTitle(copy.tryAgain)
    .setRequired(false)
    .setChoiceValues(Object.values(copy.tryAgainChoices));

  form.addParagraphTextItem()
    .setTitle(copy.improveFirst)
    .setRequired(false)
    .setHelpText(copy.improveHelp);

  form.setConfirmationMessage(copy.thanks);

  if (form.supportsAdvancedResponderPermissions()) {
    form.setPublished(true);
  }
  form.setAcceptingResponses(true);

  Logger.log("Set GAME_CONFIG.uninstallSurveyUrl in src/game-config.ts to: %s", form.getPublishedUrl());
  Logger.log("Edit URL: %s", form.getEditUrl());
  Logger.log("Check responder access is 'Anyone with the link' and test the public URL while signed out.");
}
