import { isDeepStrictEqual } from "node:util";
import { createStoryRuleLookup } from "./story-rule-context.mjs";
import { normalizeStoryCode, readStorySourceLines } from "./story-source-lines.mjs";

export const normalizeStoryStatement = (line) => normalizeStoryCode(line.trim().replace(/;$/, ""));

// Source review is explicit: a normal action, its complete guard set and the
// required effects must still match the reviewed native rule.
export const createReviewedStoryRuleReader = (readText) => {
  const sources = new Map();
  const source = (file) => {
    if (!sources.has(file)) {
      const text = readText(file);
      sources.set(file, { lines: readStorySourceLines(text).lines, lookup: createStoryRuleLookup(text) });
    }
    return sources.get(file);
  };
  const context = (file, line) => {
    const { lines, lookup } = source(file), rule = lookup(line);
    if (!rule || rule.debugOnly || !rule.actionLine || line < rule.actionLine) throw new Error(`Not a normal reviewed action: ${file}:${line}`);
    const evidence = [];
    for (let index = rule.sourceLine; index <= rule.endLine; index++) {
      const statement = normalizeStoryStatement(lines[index - 1]).replace(/^(?:IF|IFF|PROC|QRY)\s+(?=[A-Za-z_])/, "");
      if (!statement || statement.startsWith("//") || ["AND", "THEN", "IF", "IFF", "PROC", "QRY"].includes(statement)) continue;
      evidence.push({ sourcePath: file, sourceLine: index, statement });
    }
    return { rule, evidence, guards: rule.guards.filter((line) => line !== "AND").map(normalizeStoryStatement),
      actions: evidence.filter(({ sourceLine }) => sourceLine >= rule.actionLine).map(({ statement }) => statement),
      statement: normalizeStoryStatement(lines[line - 1]) };
  };
  const verify = (review) => {
    const value = context(review.sourcePath, review.actionLine);
    if (!/^(?:NOT )?[A-Za-z_]\w*\(/.test(value.statement)) throw new Error(`Reviewed line is not an action: ${review.id}`);
    if (!isDeepStrictEqual(value.guards, review.requiredGuards.map(normalizeStoryStatement))) throw new Error(`Reviewed guard set changed: ${review.id}`);
    if (!review.requiredActions.length || review.requiredActions.some((statement) => !value.actions.includes(normalizeStoryStatement(statement)))) {
      throw new Error(`Reviewed effects changed: ${review.id}`);
    }
    return value;
  };
  return { source, context, verify };
};
