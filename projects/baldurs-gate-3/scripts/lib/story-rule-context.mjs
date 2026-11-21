import { parseEndpoint, splitArguments } from "./story-goal-facts.mjs";
import { bindStoryArguments } from "./story-destination.mjs";
import { readStorySourceLines } from "./story-source-lines.mjs";

// Keep the enclosing rule, not just its action: identical TeleportTo statements
// can occur in both playable story branches and developer-only flag handlers.
export const createStoryRuleLookup = (source) => {
  const { lines, comments } = readStorySourceLines(source);
  const rules = [];
  const actionsByRule = new Map();
  const explicitlyDebug = new Set();
  const regions = [];
  let section;
  let current;
  const finish = (endLine) => {
    if (current) {
      current.endLine = endLine;
      const header = current.guards.join("\n");
      const debugProcedure = current.kind !== "IF"
        && /^(?:PROC|QRY)_[\w]*debug[\w]*\s*\(/i.test(header);
      const debugFlag = [...header.matchAll(/(?:^|\n)\s*(?:FlagSet|FlagCleared)\s*\(\s*((?:\(FLAG\))?[^,\n]+)/g)]
        .some((match) => /debug/i.test(parseEndpoint(match[1].trim())?.name ?? ""));
      const debugEvent = /(?:^|\n)\s*TextEvent\s*\(\s*"[^"\n]*debug[^"\n]*"/i.test(header);
      if (debugProcedure || debugFlag || debugEvent) explicitlyDebug.add(current);
      current.debugOnly = current.debugRegion || debugProcedure || debugFlag || debugEvent;
      rules.push(current);
      current = undefined;
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    const comment = comments[index] ?? "";
    const region = comment.match(/^\/\/\s*REGION\s+(.+)$/i)?.[1];
    const header = text.match(/^(IF|IFF|PROC|QRY)(?:\s+(.+))?$/);
    if (region) {
      regions.push(region);
    } else if (/^\/\/\s*END_REGION\b/i.test(comment)) {
      regions.pop();
    } else if (["INITSECTION", "KBSECTION", "EXITSECTION", "ENDEXITSECTION"].includes(text)) {
      finish(index);
      section = text;
    } else if (section === "KBSECTION" && header) {
      finish(index);
      current = { kind: header[1], sourceLine: index + 1, guards: header[2] ? [header[2]] : [], actionLine: null,
        debugRegion: regions.some((name) => /\bdebug\b/i.test(name)) };
      actionsByRule.set(current, []);
    } else if (current && text === "THEN") {
      if (current.actionLine) throw new Error(`Repeated THEN in story rule at line ${index + 1}`);
      current.actionLine = index + 2;
    } else if (current && !current.actionLine && text && !text.startsWith("//")) {
      current.guards.push(text);
    } else if (current?.actionLine && text && !text.startsWith("//")) {
      actionsByRule.get(current).push({ sourceLine: index + 1, statement: text });
    }
  }
  finish(lines.length);
  // Region comments can accidentally include normal lifecycle rules and their
  // helpers. Only a non-editor level-start event can override that comment.
  // Follow matching procedure calls locally; never clear a debug flag/name.
  const normalCalls = new Map();
  const addCalls = (rule) => {
    if (/^LevelGameplayStarted\s*\(/.test(rule.guards[0] ?? "")
      && splitArguments(rule.guards[0])[1] !== "0") return;
    if (rule.guards.some((guard) => /^(?:DB_IsEditor|IsEditor)\s*\(\s*1\s*\)/.test(guard))) return;
    for (const action of actionsByRule.get(rule)) {
      const predicate = action.statement.match(/^(PROC_[A-Za-z0-9_]+)\s*\(.*\);$/)?.[1];
      if (predicate) normalCalls.set(predicate, [...(normalCalls.get(predicate) ?? []), action]);
    }
  };
  for (const rule of rules) {
    if (explicitlyDebug.has(rule)) continue;
    if (rule.debugOnly && rule.kind === "IF" && /^LevelGameplayStarted\s*\(/.test(rule.guards[0] ?? "")
      && splitArguments(rule.guards[0])[1] === "0" && !rule.guards.some((guard) => /debug/i.test(guard))) {
      rule.debugOnly = false;
      const headerLine = lines.findIndex((line, index) => index >= rule.sourceLine && index < rule.actionLine
        && line.trim() === rule.guards[0]) + 1;
      rule.normalEntryEvidence = [{ sourceLine: headerLine, statement: rule.guards[0] }];
    }
    if (!rule.debugOnly) addCalls(rule);
  }
  let changed;
  do {
    changed = false;
    for (const rule of rules) {
      if (!rule.debugOnly || explicitlyDebug.has(rule) || rule.kind !== "PROC") continue;
      const predicate = rule.guards[0]?.match(/^(PROC_[A-Za-z0-9_]+)\s*\(.*\)$/)?.[1];
      // A call to another arity or a conflicting literal overload is not proof
      // that this helper is reachable from the normal entry point.
      const call = (normalCalls.get(predicate) ?? []).find((candidate) =>
        bindStoryArguments(splitArguments(rule.guards[0]), splitArguments(candidate.statement)));
      if (!call) continue;
      rule.debugOnly = false;
      rule.normalEntryEvidence = [call];
      addCalls(rule);
      changed = true;
    }
  } while (changed);
  return (sourceLine) => rules.find((rule) => sourceLine >= rule.sourceLine && sourceLine <= rule.endLine);
};
