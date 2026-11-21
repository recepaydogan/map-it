/**
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
var SURVEY_COPY = {
  "title": "Peak Map — Before You Go",
  "description": "Leaving Peak Map?\n\n30 seconds of honest feedback helps us decide what to fix next. This survey is optional, and we don't collect your email address. Thank you for helping us improve.",
  "reason": {
    "title": "What's the main reason you're uninstalling?",
    "choices": [
      "The daily island map or location data felt inaccurate or incomplete",
      "The map didn't match the island I was playing",
      "Live player tracking didn't work as expected",
      "Too many ads",
      "It hurt my game's performance or FPS",
      "The in-game minimap got in the way",
      "Missing features I was looking for",
      "Too confusing / hard to set up or use",
      "I've stopped playing PEAK",
      "I switched to another tool or a wiki instead"
    ]
  },
  "feature": {
    "title": "Which part did you use the most?",
    "choices": [
      "Daily island map & location search",
      "Live player tracking & route trail",
      "In-game minimap overlay",
      "Luggage locations & loot information",
      "Items & loot odds guide",
      "Expedition journal & route replay",
      "I barely used it"
    ]
  },
  "experience": {
    "title": "Overall, how was your experience?",
    "low": "Poor",
    "high": "Great"
  },
  "returnIntent": {
    "title": "If we fixed what bothered you, would you give us another shot?",
    "choices": [
      "Yes, definitely",
      "Maybe",
      "No"
    ]
  },
  "feedback": {
    "title": "What was missing, or what bothered you the most?",
    "help": "Which feature did you need, or what went wrong? If you hit a bug, tell us what you expected and what happened instead. Please don't include passwords, personal information, or private lobby details."
  },
  "confirmation": "Thank you for helping improve Peak Map.\n\nYour feedback helps us prioritize fixes and new features. If you return to PEAK, we'd love to see you again."
};

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
