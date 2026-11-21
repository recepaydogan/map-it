import fs from "node:fs";
import path from "node:path";
import { normalizeStoryCode, readStorySourceLines, storyStatementSpan } from "./story-source-lines.mjs";

export const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
export const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

export const attributeValue = (object, name, fallback = null) => {
  const attribute = object?.[name];
  if (!attribute || Array.isArray(attribute)) return fallback;
  return attribute.value ?? attribute.handle ?? fallback;
};

// Splits the argument list of an Osiris statement while respecting nested
// parentheses and quoted strings.
export const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};

// Resolves an `(CAST)Name_<guid>` story argument to its exact object identity.
// Variables, template names without a GUID and the empty GUID resolve to null.
export const parseEndpoint = (argument) => {
  const cast = argument.match(/^\(([A-Z]+)\)/)?.[1]?.toLocaleLowerCase("en-US") ?? null;
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const match = token.match(new RegExp(`^([A-Za-z0-9_]+)_(${guidPattern.source})$`, "i"));
  if (!match || match[2].toLocaleLowerCase("en-US") === EMPTY_GUID) return null;
  return {
    id: match[2].toLocaleLowerCase("en-US"),
    token: `${match[1]}_${match[2]}`,
    name: match[1],
    cast,
  };
};

// Reads every statement from the extracted Osiris goal files below the given
// roots. Each fact keeps its predicate, section, split arguments and exact
// source evidence so downstream catalogs can cite the originating line.
export const readStoryFacts = (storyRoots, projectRoot) => {
  const facts = [];
  const files = storyRoots
    .flatMap((root) => walkFiles(root))
    .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"));
  for (const filePath of files) {
    const { lines } = readStorySourceLines(fs.readFileSync(filePath, "utf8"));
    let section = "header";
    for (let index = 0; index < lines.length; index += 1) {
      const sectionName = lines[index].trim();
      if (sectionName === "INITSECTION") section = "init";
      else if (sectionName === "KBSECTION") section = "kb";
      else if (sectionName === "EXITSECTION") section = "exit";

      let remainder = lines[index].trim();
      if (section === "kb") remainder = remainder.replace(/^(?:IF|IFF|PROC|QRY)\s+(?=[A-Za-z_])/, "");
      while (remainder) {
        const startIndex = index;
        if (remainder === "NOT") {
          do { index++; } while (index < lines.length && !lines[index].trim());
          if (index >= lines.length) throw new Error(`Incomplete story negation: ${filePath}:${startIndex + 1}`);
          remainder += ` ${lines[index].trim()}`;
        }
        const negated = /^NOT\s+/.test(remainder);
        let statement = remainder.replace(/^NOT\s+/, "");
        if (/^[A-Za-z0-9_]+$/.test(statement)) {
          let next = index + 1;
          while (next < lines.length && !lines[next].trim()) next++;
          if (lines[next]?.trim().startsWith("(")) {
            statement += ` ${lines[next].trim()}`;
            index = next;
          }
        }
        const predicate = statement.match(/^([A-Za-z0-9_]+)\s*\(/)?.[1];
        if (!predicate) break;
        let span = storyStatementSpan(statement);
        while ((span.depth > 0 || span.quoted) && index + 1 < lines.length) {
          index += 1;
          statement += ` ${lines[index].trim()}`;
          span = storyStatementSpan(statement);
        }
        const { closingIndex } = span;
        if (closingIndex < 0 || span.depth !== 0 || span.quoted) throw new Error(`Incomplete story statement: ${filePath}:${startIndex + 1}`);
        const normalizedStatement = normalizeStoryCode(statement.slice(0, closingIndex + 1));
        facts.push({ predicate, section, negated, arguments: splitArguments(normalizedStatement),
          evidence: { sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
            sourceLine: startIndex + 1, statement: normalizedStatement } });
        remainder = statement.slice(closingIndex + 1).trim();
        if (!remainder.startsWith(";")) break;
        remainder = remainder.slice(1).trim();
      }
    }
  }
  return facts;
};
