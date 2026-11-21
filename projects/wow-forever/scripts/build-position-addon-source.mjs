import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Maintenance-only assembly; Lua is never embedded in the app bundle.
const destination = process.argv[2];
if (!destination) throw new Error("Provide an output Lua path outside src/ and public/.");
const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(destination);
for (const folder of ["src", "public", "dist", ".dev-build"]) {
  const relative = path.relative(path.join(root, folder), output);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Do not bundle addon source in app assets.");
}
const directory = path.join(root, "addons/position-bridge");
const appLocaleByGameLocale = {
  enUS: "en", deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr", koKR: "ko",
  ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant",
};
const [position, snapshot, live, card] = await Promise.all(
  ["position.lua", "character-snapshot.lua", "character-live.lua", "position-card.lua"]
    .map(name => readFile(path.join(directory, name), "utf8")),
);
const locales = await Promise.all(Object.entries(appLocaleByGameLocale).map(async ([gameLocale, appLocale]) => {
  const source = await readFile(path.join(root, "src/i18n/locales", `${appLocale}.json`), "utf8");
  return [gameLocale, JSON.parse(source).positionCard];
}));
const englishKeys = Object.keys(locales[0][1]);
const strings = locales.map(([gameLocale, translation]) => {
  const fields = englishKeys.map(key => {
    const text = translation?.[key];
    if (typeof text !== "string" || !text.trim()) throw new Error(`Missing position card text: ${gameLocale}.${key}`);
    return `        ${key} = ${JSON.stringify(text)},`;
  }).join("\n");
  return `    ${gameLocale} = {\n${fields}\n    },`;
}).join("\n");
await writeFile(output, `${position.trimEnd()}\n\ndo\n${snapshot.trimEnd()}\nend\n\ndo\n${live.trimEnd()}\nend\n\ndo\nlocal panelLocales = {\n${strings}\n}\nlocal panelStrings = panelLocales[GetLocale()] or panelLocales.enUS\n${card.trimEnd()}\nend\n`);
console.log(output);
