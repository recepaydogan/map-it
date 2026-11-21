export interface CombatActor {
  id: string;
  name: string;
  kind: "player" | "pet" | "other";
  damage: number;
  damageTaken: number;
  healing: number;
  healingReceived: number;
  overhealing: number;
  casts: number;
  interrupts: number;
  deaths: number;
  abilities: { name: string; damage: number; healing: number; casts: number; interrupts: number }[];
  targets: { id: string; name: string; damage: number }[];
}
export interface CombatSlice {
  events: number;
  durationSeconds: number;
  actors: CombatActor[];
  name?: string;
  outcome?: "kill" | "wipe";
}
export interface CombatAnalysis extends CombatSlice { fights: CombatSlice[] }

function csvFields(value: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { fields.push(field.trim()); field = ""; }
    else field += char;
  }
  fields.push(field.trim());
  return fields;
}

const cleanName = (value: string) => value.replace(/^"|"$/g, "").trim();
const numeric = (value: string | undefined) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};
const damageEvent = (event: string) => event.endsWith("_DAMAGE") || event.endsWith("_DAMAGE_LANDED")
  || event === "DAMAGE_SHIELD" || event === "DAMAGE_SPLIT";
const healEvent = (event: string) => event === "SPELL_HEAL" || event === "SPELL_PERIODIC_HEAL";
const amountIndex = (event: string, advanced: boolean) => {
  const base = event.startsWith("SWING_") ? 9 : event.startsWith("ENVIRONMENTAL_") ? 10 : 12;
  return base + (advanced ? 17 : 0);
};
const parseTime = (line: string, year: number): { time: number; month: number } | null => {
  const match = line.match(/^\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return null;
  const [, month, day, hour, minute, second, fraction] = match;
  return { time: Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    + Number(`0.${fraction ?? 0}`) * 1000, month: Number(month) };
};

export function analyzeCombatLog(text: string): CombatAnalysis {
  const createAccumulator = () => ({
    actors: new Map<string, CombatActor>(),
    abilities: new Map<string, Map<string, CombatActor["abilities"][number]>>(),
    targets: new Map<string, Map<string, CombatActor["targets"][number]>>(),
    start: null as number | null, end: null as number | null, events: 0,
    name: "", outcome: null as "kill" | "wipe" | null, encounter: false,
  });
  type Accumulator = ReturnType<typeof createAccumulator>;
  const overall = createAccumulator();
  let active = createAccumulator();
  const fights: CombatSlice[] = [];
  const actorFor = (state: Accumulator, id: string, name: string) => {
    if (!state.actors.has(id)) state.actors.set(id, { id, name,
      kind: id.startsWith("Player-") ? "player" : id.startsWith("Pet-") ? "pet" : "other",
      damage: 0, damageTaken: 0,
      healing: 0, healingReceived: 0, overhealing: 0, casts: 0, interrupts: 0,
      deaths: 0, abilities: [], targets: [] });
    return state.actors.get(id)!;
  };
  const consume = (state: Accumulator, time: number, event: string,
    sourceId: string, sourceName: string, targetId: string, targetName: string,
    abilityName: string, amount: number, overheal: number) => {
    state.start ??= time;
    state.end = time;
    state.events++;
    if (event === "UNIT_DIED") { if (targetName) actorFor(state, targetId, targetName).deaths++; return; }
    if (event === "ENVIRONMENTAL_DAMAGE") {
      if (targetName && amount > 0) actorFor(state, targetId, targetName).damageTaken += amount;
      return;
    }
    if (!sourceName) return;
    const actor = actorFor(state, sourceId, sourceName);
    const entryMap = state.abilities.get(sourceId) ?? new Map();
    state.abilities.set(sourceId, entryMap);
    const ability = entryMap.get(abilityName) ?? { name: abilityName, damage: 0, healing: 0, casts: 0, interrupts: 0 };
    entryMap.set(abilityName, ability);
    if (event === "SPELL_CAST_SUCCESS") { actor.casts++; ability.casts++; }
    else if (event === "SPELL_INTERRUPT") { actor.interrupts++; ability.interrupts++; }
    else if (damageEvent(event) && amount > 0) {
      actor.damage += amount; ability.damage += amount;
      if (targetName) {
        actorFor(state, targetId, targetName).damageTaken += amount;
        const targets = state.targets.get(sourceId) ?? new Map<string, CombatActor["targets"][number]>();
        targets.set(targetId, { id: targetId, name: targetName,
          damage: (targets.get(targetId)?.damage ?? 0) + amount });
        state.targets.set(sourceId, targets);
      }
    } else if (healEvent(event) && amount > 0) {
      actor.healing += amount; ability.healing += amount;
      actor.overhealing += overheal;
      if (targetName) actorFor(state, targetId, targetName).healingReceived += amount;
    }
  };
  const finish = (state: Accumulator): CombatSlice => {
    for (const actor of state.actors.values()) {
      actor.abilities = [...(state.abilities.get(actor.id)?.values() ?? [])]
        .sort((a, b) => b.damage + b.healing - a.damage - a.healing);
      actor.targets = [...(state.targets.get(actor.id)?.values() ?? [])]
        .sort((a, b) => b.damage - a.damage);
    }
    return { events: state.events,
      durationSeconds: state.start !== null && state.end !== null ? Math.max(0, (state.end - state.start) / 1000) : 0,
      actors: [...state.actors.values()].sort((a, b) => b.damage + b.healing - a.damage - a.healing),
      ...(state.name ? { name: state.name } : {}),
      ...(state.outcome ? { outcome: state.outcome } : {}) };
  };
  let advancedLog = false;
  let year = 2000;
  let previousMonth: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    let timestamp = parseTime(line, year);
    if (timestamp === null) continue;
    if (previousMonth === 12 && timestamp.month === 1) {
      year++;
      timestamp = parseTime(line, year)!;
    }
    previousMonth = timestamp.month;
    const { time } = timestamp;
    const payload = line.replace(/^\s*\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s+/, "");
    const parts = csvFields(payload);
    const event = parts[0];
    if (event === "COMBAT_LOG_VERSION") {
      advancedLog = parts.includes("ADVANCED_LOG_ENABLED") && parts[parts.indexOf("ADVANCED_LOG_ENABLED") + 1] === "1";
      continue;
    }
    if (event === "ENCOUNTER_START") {
      if (active.events) fights.push(finish(active));
      active = createAccumulator();
      active.start = time;
      active.name = cleanName(parts[2] ?? "");
      active.encounter = true;
      continue;
    }
    if (event === "ENCOUNTER_END") {
      if (active.events) {
        active.end = time;
        active.outcome = parts[5] === "1" ? "kill" : "wipe";
        fights.push(finish(active));
      }
      active = createAccumulator();
      continue;
    }
    if (!event || !/^(SPELL_|SWING_|RANGE_|ENVIRONMENTAL_DAMAGE|UNIT_DIED)/.test(event)) continue;
    const sourceName = cleanName(parts[2] ?? "");
    const targetName = cleanName(parts[6] ?? "");
    const actorId = (guid: string | undefined, name: string) =>
      guid && guid !== "nil" && guid !== "0000000000000000" ? guid : `name:${name}`;
    const sourceId = actorId(parts[1], sourceName);
    const targetId = actorId(parts[5], targetName);
    if (!sourceName && !targetName) continue;
    const swing = event.startsWith("SWING_");
    const abilityName = swing ? "Melee" : cleanName(parts[10] ?? "") || event;
    const start = amountIndex(event, advancedLog || parts.length >= amountIndex(event, true) + 7);
    const amount = numeric(parts[start]);
    const overheal = healEvent(event) ? numeric(parts[start + 1]) : 0;
    if (!active.encounter && active.end !== null && time - active.end > 30_000) {
      fights.push(finish(active));
      active = createAccumulator();
    }
    consume(overall, time, event, sourceId, sourceName, targetId, targetName, abilityName, amount, overheal);
    consume(active, time, event, sourceId, sourceName, targetId, targetName, abilityName, amount, overheal);
  }
  if (active.events) fights.push(finish(active));
  return { ...finish(overall), fights };
}
