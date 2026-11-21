/**
 * Elden Ring Atlas — uninstall survey generator (Google Apps Script).
 *
 * This is NOT a Node script. It runs on Google's servers via Apps Script and
 * builds the full uninstall survey Google Form in one click, following
 * Overwolf's uninstall-survey guidance (3–5 questions, mostly multiple choice,
 * a single open-ended question last, purpose + alternatives communicated).
 *
 * HOW TO RUN (one time, ~1 minute):
 *   1. Open https://script.google.com  →  New project.
 *   2. Delete the sample code, paste ALL of this file, and Save.
 *   3. Press Run ▶ (the createUninstallSurvey function). Approve the one-time
 *      Google permission prompt (it only lets the script create your form).
 *   4. Open View → Execution log. It prints the PUBLIC URL — paste it into
 *      src/windows/uninstall/uninstall-entry.ts as SURVEY_URL.
 *   5. Open the EDIT URL to tweak wording, colors, or the header image.
 *
 * Re-running creates a brand-new form each time (it never edits an old one).
 */
function createUninstallSurvey() {
  var form = FormApp.create('Elden Ring Atlas — Before You Go');

  form.setDescription(
    "You're about to uninstall Elden Ring Atlas.\n\n" +
    "30 seconds of honest feedback goes straight to the devs and shapes what we " +
    "fix next. No account or sign-in needed — thank you for helping us improve."
  );
  form.setProgressBar(false);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);

  // Q1 — Primary reason for churn (required, single choice + free-text "Other").
  form.addMultipleChoiceItem()
    .setTitle("What's the main reason you're uninstalling?")
    .setRequired(true)
    .setChoiceValues([
      "Map or item data felt inaccurate or incomplete",
      "Too many ads",
      "It hurt my game's performance or FPS",
      "The in-game overlay got in the way",
      "Missing features I was looking for",
      "Too confusing / hard to use",
      "I've stopped playing Elden Ring / Nightreign",
      "I switched to another app or a wiki instead",
    ])
    .showOtherOption(true);

  // Q2 — Open follow-up. Makes Q1's "Missing features" concrete (which one?)
  // and gives users the space to write "what bothered you" that Q5 refers to.
  form.addParagraphTextItem()
    .setTitle("What was missing, or what bothered you the most?")
    .setHelpText(
      "If a feature was missing, which one? If something bugged you or pushed " +
      "you out, what was it? This is the single most useful thing you can tell us."
    );

  // Q3 — What they valued most (tells us what NOT to break).
  form.addMultipleChoiceItem()
    .setTitle("Which part did you use the most?")
    .setChoiceValues([
      "Elden Ring interactive map",
      "Nightreign live map",
      "Boss pages & guides",
      "Item search & locations",
      "Nightreign archive (bosses, items, relics)",
      "In-game overlay",
      "I barely used it",
    ]);

  // Q4 — Overall satisfaction (fast single tap).
  form.addScaleItem()
    .setTitle("Overall, how was your experience?")
    .setBounds(1, 10)
    .setLabels("Poor", "Great");

  // Q5 — Win-back intent. "what bothered you" is theirs to write in Q2.
  form.addMultipleChoiceItem()
    .setTitle("If we fixed what bothered you, would you give us another shot?")
    .setChoiceValues(["Yes, definitely", "Maybe", "No"]);

  form.setConfirmationMessage(
    "Thank you — we read every single response. 🙌\n\n" +
    "Hitting a specific bug or crash? Add the details above and we'll try to " +
    "help. You can reinstall anytime from the Overwolf store."
  );

  Logger.log('──── Paste into src/windows/uninstall/uninstall-entry.ts ────');
  Logger.log('SURVEY_URL = "%s"', form.getPublishedUrl());
  Logger.log('─────────────────────────────────────────────────────────────');
  Logger.log('EDIT the form here: %s', form.getEditUrl());
  Logger.log('Responses collect under the form\'s "Responses" tab (link it to a Sheet if you like).');
}
