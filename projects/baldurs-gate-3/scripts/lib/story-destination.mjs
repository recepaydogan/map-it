import { parseEndpoint } from "./story-goal-facts.mjs";

export const STORY_DESTINATION_PREDICATES = {
  TeleportTo: "teleport",
  CharacterMoveTo: "move",
  PROC_CharacterMoveTo: "move",
  PROC_AppearOutOfSightTo: "appear",
};

// Additional source evidence must not move an already source-valid marker.
// Only retain an anchor present in this map/floor's freshly resolved candidates.
export const selectStoryDestination = (destinations, previousAnchorId) => destinations
  .find(({ anchor }) => anchor.id === previousAnchorId)
  ?? [...destinations].sort((left, right) => right.relation.evidence.length - left.relation.evidence.length
    || left.anchor.id.localeCompare(right.anchor.id, "en"))[0];

// Local movement alternatives can share one pin. Independently reviewed NPC
// scenes cannot: a later encounter must survive a recruitment pin on this map,
// and must not lend its role, loot or conditions to another scene's anchor.
export const groupStoryDestinations = (destinations) => {
  // Partition by anchor, including unannotated relations at that same anchor.
  // Otherwise one physical anchor can accidentally produce duplicate IDs.
  const separateAnchors = new Set(destinations.filter(({ relation }) => relation.npcScene
    || relation.campEntryContext || relation.campResidentContext).map(({ anchor }) => anchor.id));
  const groups = new Map();
  for (const destination of destinations) {
    const key = separateAnchors.has(destination.anchor.id) ? `scene:${destination.anchor.id}` : "movement";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(destination);
  }
  return [...groups.values()];
};

const uncast = (value) => value.replace(/^\([A-Z]+\)/, "").trim();
const variable = (value) => /^_[A-Za-z]\w*$/.test(uncast(value)) ? uncast(value) : null;
const key = (value) => parseEndpoint(value)?.id ?? uncast(value);

export const bindStoryArguments = (patterns, values) => {
  if (patterns.length !== values.length) return null;
  const bindings = new Map();
  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];
    const value = values[index];
    if (uncast(pattern) === "_") continue;
    const name = variable(pattern);
    if (name) {
      if (bindings.has(name) && key(bindings.get(name)) !== key(value)) return null;
      bindings.set(name, value);
    } else if (key(pattern) !== key(value)) return null;
  }
  return bindings;
};
export const substituteStoryArguments = (args, bindings) => args.map((argument) => bindings.get(variable(argument)) ?? argument);
export const forwardsDestinationPair = (parameters, args) => [0, 1].every((index) => variable(args[index] ?? "")
  && variable(parameters[index] ?? "") === variable(args[index]));

// Reject only UUIDs or literal labels contradicted by a bound comparison.
// Unknown variables, quest predicates and numeric expressions remain runtime
// conditions, not evidence that a branch will execute.
export const contradictsStoryBoundGuard = (bindings, guardLines = []) => guardLines.join("\n")
  .split(/(?:^|\n)\s*AND\s*(?:\n|$)/).some((condition) => {
  const comparison = condition.trim().match(/^([\s\S]+?)\s*(==|!=)\s*([\s\S]+)$/);
  if (!comparison) return false;
  const atom = (argument) => {
    const value = bindings.get(variable(argument.trim())) ?? argument.trim();
    const id = parseEndpoint(value)?.id ?? (/^(?:NULL_)?00000000-0000-0000-0000-000000000000$/i.test(uncast(value))
      ? "00000000-0000-0000-0000-000000000000" : null);
    if (id) return { type: "identity", value: id };
    // Escape interpretation is deliberately outside this bounded binder.
    const literal = uncast(value).match(/^"([^"\\\r\n]*)"$/);
    return literal ? { type: "string", value: literal[1] } : null;
  };
  const left = atom(comparison[1]), right = atom(comparison[3]);
  return left !== null && right !== null && left.type === right.type
    && (comparison[2] === "==" ? left.value !== right.value : left.value === right.value);
});

// Resolve only a direct pair or a pair joined by one explicit positive DB row.
// Do not combine unrelated tables, guess variables or treat runtime guards as
// satisfied. The action and its binding evidence describe a conditional site.
export const resolveStoryDestination = (fact, guards, initialRows, guardLines = []) => {
  const pair = fact.arguments.slice(0, 2);
  if (pair.length !== 2 || pair.some((argument) => !parseEndpoint(argument) && !variable(argument))) return [];
  const variables = [...new Set(pair.map(variable).filter(Boolean))];
  if (!variables.length) return contradictsStoryBoundGuard(new Map(), guardLines)
    ? [] : [{ arguments: fact.arguments, evidence: [fact.evidence] }];
  const sources = guards.filter((guard) => !guard.negated && guard.predicate.startsWith("DB_")
    && variables.every((name) => guard.arguments.some((argument) => variable(argument) === name)));
  if (sources.length !== 1) return [];
  const [guard] = sources;
  return (initialRows.get(guard.predicate) ?? []).flatMap((row) => {
    if (row.negated) return [];
    const bindings = bindStoryArguments(guard.arguments, row.arguments);
    if (!bindings || contradictsStoryBoundGuard(bindings, guardLines)) return [];
    const args = substituteStoryArguments(fact.arguments, bindings);
    if (!parseEndpoint(args[0]) || !parseEndpoint(args[1])) return [];
    return [{ arguments: args, evidence: [row.evidence, guard.evidence, fact.evidence] }];
  });
};
