import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GAME_CONFIG } from "../src/game-config.ts";

const template = await readFile(new URL("./create-uninstall-survey.gs", import.meta.url), "utf8");
const placeholder = "__SURVEY_CONFIG__";
const occurrences = template.split(placeholder).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one survey config placeholder; found ${occurrences}.`);
}

const locale = JSON.parse(await readFile(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const config = JSON.stringify({
  appName: GAME_CONFIG.appName,
  gameName: GAME_CONFIG.gameName,
  copy: locale.uninstallSurvey,
});

const outputDirectory = new URL("../uninstall-survey.local/", import.meta.url);
const output = new URL("create-uninstall-survey.gs", outputDirectory);
await mkdir(outputDirectory, { recursive: true });
await writeFile(output, template.replace(placeholder, () => config), "utf8");
console.log(`Ready to paste into Google Apps Script: ${fileURLToPath(output)}`);
