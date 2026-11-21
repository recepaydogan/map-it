/**
 * Google Apps Script template. Generate the ready-to-paste version with:
 * node --experimental-strip-types scripts/build-uninstall-survey.mjs
 *
 * Paste ALL of uninstall-survey.local/create-uninstall-survey.gs into a new
 * project at https://script.google.com and run createUninstallSurvey.
 * Authorize Google Forms access when prompted. The execution log prints the
 * public URL to put in GAME_CONFIG.uninstallSurveyUrl in src/game-config.ts.
 * Each run creates a new form; run once and keep its edit URL.
 */
function createUninstallSurvey() {
  var config = __SURVEY_CONFIG__;
  var form = FormApp.create(config.appName + " — Before You Go");

  form.setDescription(
    "You're uninstalling " + config.appName + ".\n\n" +
    "30 seconds of honest feedback helps us decide what to fix next. " +
    "Thank you for helping us improve. Please don't include personal information."
  );
  form.setProgressBar(false);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);

  // Only the primary reason is required; all follow-up questions are optional.
  form.addMultipleChoiceItem()
    .setTitle("What's the main reason you're uninstalling?")
    .setRequired(true)
    .setChoiceValues([
      "Map or item data felt inaccurate or incomplete",
      "Too many ads",
      "It hurt my game's performance or FPS",
      "The in-game overlay got in the way",
      "Live position tracking didn't work as expected",
      "Missing features I was looking for",
      "Too confusing / hard to use",
      "I've stopped playing " + config.gameName,
      "I switched to another app, map, or wiki",
    ])
    .showOtherOption(true);

  form.addParagraphTextItem()
    .setTitle("What was missing, or what bothered you the most?")
    .setHelpText(
      "Which feature did you need, or what went wrong? " +
      "For map or data issues, the location or item name helps us investigate."
    );

  form.addMultipleChoiceItem()
    .setTitle("Which part did you use the most?")
    .setChoiceValues([
      "Interactive map & search",
      "Item database & locations",
      "Quest information & locations",
      "Live position tracking in-game",
      "In-game overlay / minimap",
      "Saved markers & notes",
      "I barely used it",
    ])
    .showOtherOption(true);

  form.addScaleItem()
    .setTitle("Overall, how was your experience?")
    .setBounds(1, 10)
    .setLabels("Poor", "Great");

  form.addMultipleChoiceItem()
    .setTitle("If we fixed what bothered you, would you give us another shot?")
    .setChoiceValues(["Yes, definitely", "Maybe", "No"]);

  form.setConfirmationMessage(
    "Thank you for your feedback! It helps us improve the app.\n\n" +
    "You can reinstall anytime from the Overwolf Appstore."
  );

  // Publishing is required for forms that support advanced responder access.
  if (form.supportsAdvancedResponderPermissions()) {
    form.setPublished(true);
  }
  form.setAcceptingResponses(true);

  Logger.log("Paste into GAME_CONFIG in src/game-config.ts:");
  Logger.log('uninstallSurveyUrl: "%s",', form.getPublishedUrl());
  Logger.log("EDIT URL: %s", form.getEditUrl());
  Logger.log("Check responder access is 'Anyone with the link', then test the public URL in a signed-out browser.");
  Logger.log("Read feedback in the form's Responses tab; optionally link it to a Google Sheet there.");
}
