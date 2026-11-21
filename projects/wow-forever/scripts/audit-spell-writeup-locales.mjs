/** Audit the spell guide prose that is currently visible in SpellWriteupPanel. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const classes = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const fields = new Set();
const supportedFields = new Set();

for (const classId of classes) {
  const classWriteups = await read(`public/data/spells/writeups/${classId}.json`);
  for (const writeup of [...Object.values(classWriteups.abilities ?? {}),
    ...Object.values(classWriteups.talents ?? {})]) {
    if (writeup.summary) supportedFields.add(writeup.summary);
    if (writeup.forever) {
      fields.add(writeup.forever);
      supportedFields.add(writeup.forever);
    }
    for (const text of writeup.useWhen ?? []) {
      fields.add(text);
      supportedFields.add(text);
    }
    for (const text of [...(writeup.details ?? []), ...(writeup.avoidWhen ?? [])]) {
      supportedFields.add(text);
    }
  }
}

const source = await read("public/data/spells/writeups/locales/source.json");
if (source.version !== 1 || !Array.isArray(source.strings) ||
  new Set(source.strings).size !== source.strings.length ||
  source.strings.some((text) => !supportedFields.has(text))) {
  throw new Error("Spell write-up source contains duplicate or unused prose");
}
const sourceIndices = new Map(source.strings.map((text, index) => [text, index]));

for (const language of languages) {
  const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
  if (pack.version !== 1 || pack.language !== language ||
    !Array.isArray(pack.values) || pack.values.length !== source.strings.length ||
    pack.values.some((text) => typeof text !== "string")) {
    throw new Error(`${language}: invalid spell write-up locale pack`);
  }
  const remaining = [...fields].filter((text) => {
    const index = sourceIndices.get(text);
    return index === undefined || !pack.values[index].trim() || pack.values[index] === text;
  });
  const englishCarryover = pack.values.filter((text, index) =>
    !text.trim() || text === source.strings[index]).length;
  console.log(`${language}: ${fields.size - remaining.length} visible prose strings translated; ` +
    `${remaining.length} visible English prose strings remain; ${englishCarryover} source entries still English`);
  if (process.argv.includes("--samples")) {
    for (const text of remaining.slice(0, 3)) console.log(`  ${text}`);
  }
  if (process.argv.includes("--fail") && (remaining.length || englishCarryover)) process.exitCode = 1;
}
