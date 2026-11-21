import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "locales");
const english = JSON.parse(await readFile(join(directory, "en.json"), "utf8"));

const fill = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) target[key] = structuredClone(value);
    else if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key]))
      fill(target[key], value);
  }
};

for (const file of (await readdir(directory)).filter(file => file.endsWith(".json") && file !== "en.json").sort()) {
  const path = join(directory, file), locale = JSON.parse(await readFile(path, "utf8"));
  fill(locale, english); await writeFile(path, `${JSON.stringify(locale, null, 2)}\n`, "utf8");
}

console.log("Missing locale keys received English review drafts; existing translations were preserved.");
