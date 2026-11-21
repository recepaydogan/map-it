import { parseEndpoint } from "./story-goal-facts.mjs";
import { bindStoryArguments, substituteStoryArguments } from "./story-destination.mjs";

// Runtime camp registrations can bind a fixed actor to several explicit INIT
// rows. Keep the camp selector: these are conditional sites, not simultaneous
// spawns. Initial companion registrations need a separate availability audit.
export const resolveStoryCampDestinations = (facts, ruleFor, runtimeEvidence) => {
  const rows = Map.groupBy(facts.filter((fact) => fact.section === "init" && !fact.negated && fact.predicate.startsWith("DB_")), ({ predicate }) => predicate);
  const bySource = Map.groupBy(facts, ({ evidence }) => evidence.sourcePath);
  return facts.filter((fact) => fact.predicate === "DB_ORI_OriginCampData" && !fact.negated && fact.section === "kb").flatMap((fact) => {
    const character = parseEndpoint(fact.arguments[0]);
    const rule = ruleFor(fact);
    if (!character || !rule?.actionLine || rule.debugOnly || fact.evidence.sourceLine < rule.actionLine) return [];
    const variables = fact.arguments.slice(1).filter((argument) => /^_[A-Za-z]\w*$/.test(argument));
    if (variables.length !== 2) return [];
    const guards = bySource.get(fact.evidence.sourcePath).filter((guard) => !guard.negated
      && guard.evidence.sourceLine >= rule.sourceLine && guard.evidence.sourceLine < rule.actionLine
      && guard.predicate.startsWith("DB_") && variables.every((variable) => guard.arguments.includes(variable)));
    if (guards.length !== 1) return [];
    const [guard] = guards;
    return (rows.get(guard.predicate) ?? []).flatMap((row) => {
      const bindings = bindStoryArguments(guard.arguments, row.arguments);
      if (!bindings) return [];
      const args = substituteStoryArguments(fact.arguments, bindings);
      const anchor = parseEndpoint(args[2]);
      const camp = args[1].match(/^"([^"\n]+)"$/)?.[1];
      if (!anchor || !camp) return [];
      return [{ id: `${character.id}:camp:${anchor.id}`, kind: "camp", character: { ...character, type: "character" },
        anchor: { ...anchor, type: "trigger" }, camp, arrivalState: "unspecified", arrivalEvidence: [],
        evidence: [row.evidence, guard.evidence, fact.evidence, ...runtimeEvidence] }];
    });
  });
};
