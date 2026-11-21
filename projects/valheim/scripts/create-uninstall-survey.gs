/**
 * Valheim Map — uninstall survey generator (Google Apps Script).
 * Adapted from the Elden Ring Atlas survey in the sibling ER project.
 *
 * This is NOT a Node script. Run it in Google Apps Script:
 *   1. Open https://script.google.com and create a new project.
 *   2. Replace the sample code with this entire file and save.
 *   3. Run createUninstallSurvey and review Google's permission prompt.
 *   4. The execution log prints the public respondent URL and the edit URL.
 *   5. In the form editor, verify responder access is "Anyone with the link".
 *      Test the public URL while signed out before using it in the app.
 *      Workspace policies may restrict access even with email collection off.
 *   6. Paste the PUBLIC URL into SURVEY_URL in
 *      src/windows/uninstall/uninstall-entry.ts, then rebuild the app / OPK.
 *
 * Re-running creates a NEW form; it never changes an existing survey.
 * The app's uninstall handler opens that URL in the user's default browser.
 */
function createUninstallSurvey() {
  var form = FormApp.create('Valheim Map — Before You Go');

  form.setDescription(
    "Leaving Valheim Map?\n\n" +
    "30 seconds of honest feedback helps us decide what to fix next. " +
    "This survey is optional, and we don't collect your email address. " +
    "Thank you for helping us improve."
  );
  form.setProgressBar(false);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setShuffleQuestions(false);

  // Q1 — Main uninstall reason; the only required question.
  form.addMultipleChoiceItem()
    .setTitle("What's the main reason you're uninstalling?")
    .setRequired(true)
    .setChoiceValues([
      "Map, resource locations, or item data felt inaccurate or incomplete",
      "I couldn't load my world or get the correct seed map",
      "Live player or inventory tracking didn't work as expected",
      "Too many ads",
      "It hurt my game's performance or FPS",
      "The in-game overlay got in the way",
      "Missing features I was looking for",
      "Too confusing / hard to set up or use",
      "I've stopped playing Valheim",
      "I switched to another tool or a wiki instead",
    ])
    .showOtherOption(true);

  // Q2 — Which existing feature was most useful.
  form.addMultipleChoiceItem()
    .setTitle("Which part did you use the most?")
    .setRequired(false)
    .setChoiceValues([
      "Interactive world map & seed exploration",
      "Live player tracking",
      "Boss, trader, dungeon & resource locations",
      "Item search & game database",
      "Crafting planner & material requirements",
      "Inventory & chest tracking",
      "Building tools & base planning",
      "In-game overlay",
      "I barely used it",
    ]);

  // Q3 — Overall satisfaction, matching the ER survey's 1–10 scale.
  form.addScaleItem()
    .setTitle("Overall, how was your experience?")
    .setRequired(false)
    .setBounds(1, 10)
    .setLabels("Poor", "Great");

  // Q4 — Whether resolving the issue could bring the user back.
  form.addMultipleChoiceItem()
    .setTitle("If we fixed what bothered you, would you give us another shot?")
    .setRequired(false)
    .setChoiceValues(["Yes, definitely", "Maybe", "No"]);

  // Q5 — Keep the optional open-ended follow-up last.
  form.addParagraphTextItem()
    .setTitle("What was missing, or what bothered you the most?")
    .setRequired(false)
    .setHelpText(
      "Which feature did you need, or what went wrong? If you hit a bug, " +
      "tell us what you expected and what happened instead. " +
      "Please don't include passwords, personal information, or private server details."
    );

  form.setConfirmationMessage(
    "Thank you for helping improve Valheim Map.\n\n" +
    "Your feedback helps us prioritize fixes and new features. " +
    "If you return to Valheim, we'd love to see you again."
  );

  // New Forms support publishing; older forms may only support accepting responses.
  if (form.supportsAdvancedResponderPermissions()) {
    form.setPublished(true);
  }
  form.setAcceptingResponses(true);

  Logger.log('PUBLIC URL: %s', form.getPublishedUrl());
  Logger.log('Set SURVEY_URL in src/windows/uninstall/uninstall-entry.ts, then rebuild.');
  Logger.log('EDIT URL: %s', form.getEditUrl());
  Logger.log('Responses are available in the form editor under the Responses tab.');
  Logger.log('Verify public access while signed out before connecting this URL to the app.');
}
