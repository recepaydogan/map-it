// Keep game-specific names in GAME_CONFIG and inject them into a local artifact.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GAME_CONFIG } from "../src/game-config.ts";

const template = await readFile(new URL("./create-uninstall-survey.gs", import.meta.url), "utf8");
const outputDirectory = new URL("../uninstall-survey.local/", import.meta.url);
const output = new URL("create-uninstall-survey.gs", outputDirectory);
const config = JSON.stringify({ appName: GAME_CONFIG.appName, gameName: GAME_CONFIG.gameName });

await mkdir(outputDirectory, { recursive: true });
await writeFile(output, template.replace("__SURVEY_CONFIG__", () => config), "utf8");
console.log(`Ready to paste into Google Apps Script: ${fileURLToPath(output)}`);
