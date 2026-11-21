import { isDeepStrictEqual } from "node:util";
import { createReviewedStoryRuleReader, normalizeStoryStatement } from "./reviewed-story-rules.mjs";
import { storyStatementSpan } from "./story-source-lines.mjs";

// Opt-in logical statements for newer reviews. Existing physical-line evidence
// contracts remain unchanged; multiline calls keep their first source line.
export const createLogicalReviewedStoryRuleReader = (readText) => {
  const { source } = createReviewedStoryRuleReader(readText);
  const context = (file, line) => {
    const { lines, lookup } = source(file), rule = lookup(line);
    if (!rule || rule.debugOnly || !rule.actionLine || line < rule.actionLine) throw new Error(`Not a normal action: ${file}:${line}`);
    const evidence = [];
    for (let index = rule.sourceLine - 1; index < rule.endLine; index++) {
      const sourceLine = index + 1;
      let statement = lines[index].trim().replace(/^(?:IF|IFF|PROC|QRY)\s+(?=[A-Za-z_])/, "");
      if (!statement || ["AND", "THEN", "IF", "IFF", "PROC", "QRY"].includes(statement)) continue;
      if (statement === "NOT") {
        do { index++; } while (index < rule.endLine && !lines[index].trim());
        if (index >= rule.endLine) throw new Error(`Incomplete negation: ${file}:${sourceLine}`);
        statement += ` ${lines[index].trim()}`;
      }
      if (/^(?:NOT\s+)?[A-Za-z_]\w*\s*\(/.test(statement)) {
        let span = storyStatementSpan(statement);
        while ((span.depth > 0 || span.quoted) && index + 1 < rule.endLine) {
          statement += ` ${lines[++index].trim()}`; span = storyStatementSpan(statement);
        }
        if (span.depth !== 0 || span.quoted || span.closingIndex < 0 || !["", ";"].includes(statement.slice(span.closingIndex + 1).trim())) {
          throw new Error(`Incomplete or ambiguous statement: ${file}:${sourceLine}`);
        }
      }
      evidence.push({ sourcePath: file, sourceLine, statement: normalizeStoryStatement(statement) });
    }
    const statement = evidence.find((entry) => entry.sourceLine === line)?.statement;
    if (!statement) throw new Error(`Action must start at its cited line: ${file}:${line}`);
    return { rule, evidence, statement,
      guards: evidence.filter(({ sourceLine }) => sourceLine < rule.actionLine).map(({ statement }) => statement),
      actions: evidence.filter(({ sourceLine }) => sourceLine >= rule.actionLine).map(({ statement }) => statement) };
  };
  const verify = (review) => {
    const value = context(review.sourcePath, review.actionLine);
    if (!/^(?:NOT )?[A-Za-z_]\w*\(/.test(value.statement)
      || !isDeepStrictEqual(value.guards, review.requiredGuards.map(normalizeStoryStatement))
      || !review.requiredActions.length || review.requiredActions.some((action) => !value.actions.includes(normalizeStoryStatement(action)))) {
      throw new Error(`Logical native rule differs: ${review.id}`);
    }
    return value;
  };
  return { source, context, verify };
};
