import { parseEndpoint } from "./story-goal-facts.mjs";
import { bindStoryArguments, contradictsStoryBoundGuard, forwardsDestinationPair, resolveStoryDestination, substituteStoryArguments } from "./story-destination.mjs";

// This is a bounded source binder, not an interpreter of runtime quest state.
export const createStoryDestinationResolver = (facts, ruleFor, supportFacts = []) => {
  // Shared helper definitions can prove an arrival effect. They are not new
  // destination call sites and must not expand the set of mined movement rows.
  const effectFacts = [...facts, ...supportFacts];
  const initialRows = Map.groupBy(facts.filter(({ section, predicate, negated }) => section === "init" && predicate.startsWith("DB_") && !negated), ({ predicate }) => predicate);
  const bySource = Map.groupBy(effectFacts, ({ evidence }) => evidence.sourcePath);
  const ruleFacts = new Map();
  const contents = (fact) => {
    const rule = ruleFor(fact);
    if (!rule) return { guards: [], actions: [] };
    const key = `${fact.evidence.sourcePath}:${rule.sourceLine}`;
    if (!ruleFacts.has(key)) {
      const inside = bySource.get(fact.evidence.sourcePath).filter(({ evidence }) => evidence.sourceLine >= rule.sourceLine && evidence.sourceLine <= rule.endLine);
      ruleFacts.set(key, {
        guards: inside.filter(({ evidence }) => evidence.sourceLine < rule.actionLine),
        actions: inside.filter(({ evidence }) => rule.actionLine && evidence.sourceLine >= rule.actionLine),
      });
    }
    return ruleFacts.get(key);
  };
  const isAction = (fact) => {
    const rule = ruleFor(fact);
    return !fact.negated && (fact.section === "init" || rule?.actionLine && fact.evidence.sourceLine >= rule.actionLine && !rule.debugOnly);
  };
  const calls = Map.groupBy(facts.filter((fact) => fact.predicate.startsWith("PROC_") && isAction(fact)), ({ predicate }) => predicate);
  const mutableTables = new Set(effectFacts.filter((fact) => {
    if (!fact.predicate.startsWith("DB_")) return false;
    const rule = ruleFor(fact);
    return fact.section === "exit" || fact.section === "init" && fact.negated
      || rule?.actionLine && fact.evidence.sourceLine >= rule.actionLine;
  }).map(({ predicate }) => predicate));
  const headers = effectFacts.filter((fact) => {
    const rule = ruleFor(fact);
    return rule && !rule.debugOnly && contents(fact).guards[0] === fact;
  });
  const procedures = Map.groupBy(headers.filter((fact) => ruleFor(fact).kind === "PROC"), ({ predicate }) => predicate);
  const events = headers.filter((fact) => ruleFor(fact).kind === "IF" && fact.predicate === "EntityEvent");
  const resolve = (fact, trail = new Set()) => {
    const rule = ruleFor(fact);
    const { guards } = contents(fact);
    const direct = resolveStoryDestination(fact, guards, initialRows, rule?.guards);
    if (direct.length) return direct.map((value) => ({ ...value, contexts: [{ fact, arguments: value.arguments }] }));
    if (rule?.kind !== "PROC" || trail.size >= 4) return [];
    const header = guards[0];
    if (!header || !forwardsDestinationPair(header.arguments, fact.arguments) || trail.has(header.predicate)) return [];
    const nextTrail = new Set([...trail, header.predicate]);
    return (calls.get(header.predicate) ?? []).flatMap((call) => resolve(call, nextTrail).flatMap((resolved) => {
      const bindings = bindStoryArguments(header.arguments, resolved.arguments);
      if (!bindings || contradictsStoryBoundGuard(bindings, rule.guards)) return [];
      const args = substituteStoryArguments(fact.arguments, bindings);
      if (!parseEndpoint(args[0]) || !parseEndpoint(args[1])) return [];
      return [{ arguments: args, evidence: [...resolved.evidence, header.evidence, fact.evidence], contexts: [...resolved.contexts, { fact, arguments: args }] }];
    }));
  };
  // A literal arrival event or matching unguarded procedure overload can prove
  // death at this conditional site. Extra guards require fully bound rows in
  // an immutable INIT table; runtime flags and mutable quest tables stay unknown.
  const corpseEvidence = (resolved) => {
    const actorId = parseEndpoint(resolved.arguments[0])?.id;
    const effects = (header, args, trail = new Set()) => {
      const rule = ruleFor(header);
      if (!rule || rule.debugOnly || trail.size >= 4) return [];
      const key = `${header.evidence.sourcePath}:${header.evidence.sourceLine}`;
      if (trail.has(key)) return [];
      const bindings = bindStoryArguments(header.arguments, args);
      if (!bindings) return [];
      const { guards, actions } = contents(header);
      // Reject comparisons, negation and multiline conditions not represented
      // by this exact fact list; this intentionally does not evaluate Osiris.
      const conditionLines = rule.guards.filter((line) => line !== "AND");
      if (conditionLines.length !== guards.length || conditionLines.some((line, index) => line.replace(/\s+/g, " ") !== guards[index].evidence.statement)) return [];
      const guardEvidence = [];
      for (const guard of guards.slice(1)) {
        if (guard.negated || !guard.predicate.startsWith("DB_") || mutableTables.has(guard.predicate)) return [];
        const values = substituteStoryArguments(guard.arguments, bindings);
        if (values.some((value) => /^(?:\([A-Z]+\))?_/.test(value))) return [];
        const row = (initialRows.get(guard.predicate) ?? []).find((candidate) => bindStoryArguments(values, candidate.arguments));
        if (!row) return [];
        guardEvidence.push(guard.evidence, row.evidence);
      }
      const nextTrail = new Set([...trail, key]);
      return actions.filter((action) => !action.negated).flatMap((action) => {
        const values = substituteStoryArguments(action.arguments, bindings);
        if (action.predicate === "Die" && parseEndpoint(values[0])?.id === actorId) return [header.evidence, ...guardEvidence, action.evidence];
        if (!action.predicate.startsWith("PROC_")) return [];
        return (procedures.get(action.predicate) ?? []).flatMap((child) => {
          const nested = effects(child, values, nextTrail);
          return nested.length ? [header.evidence, ...guardEvidence, action.evidence, ...nested] : [];
        });
      });
    };
    return resolved.contexts.flatMap(({ fact, arguments: args }) => {
      if (fact.predicate.startsWith("PROC_")) return (procedures.get(fact.predicate) ?? []).flatMap((header) => effects(header, args));
      if (fact.predicate !== "TeleportTo" || !/^"[^"\n]+"$/.test(args[2] ?? "")) return [];
      return events.flatMap((header) => effects(header, [args[0], args[2]]));
    });
  };
  return { resolve, corpseEvidence };
};
