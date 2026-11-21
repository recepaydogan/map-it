import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const localeDirectory = path.join(scriptDirectory, "..", "src", "i18n", "locales");
const source = JSON.parse(fs.readFileSync(path.join(localeDirectory, "en.json"), "utf8"));

const syncShape = (template, translation) => Object.fromEntries(Object.entries(template).map(([key, value]) => {
  if (typeof value === "string") {
    return [key, typeof translation?.[key] === "string" ? translation[key] : value];
  }
  const translatedBranch = translation?.[key];
  return [key, syncShape(
    value,
    translatedBranch && typeof translatedBranch === "object" && !Array.isArray(translatedBranch)
      ? translatedBranch
      : {},
  )];
}));

for (const fileName of fs.readdirSync(localeDirectory).filter((name) => name.endsWith(".json") && name !== "en.json")) {
  const filePath = path.join(localeDirectory, fileName);
  const translation = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(filePath, `${JSON.stringify(syncShape(source, translation), null, 2)}\n`, "utf8");
  console.log(`Synced ${fileName}`);
}
