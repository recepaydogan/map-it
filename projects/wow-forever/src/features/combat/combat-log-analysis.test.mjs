import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCombatLog } from "./combat-log-analysis.ts";

const actor = (analysis, name) => {
  const result = analysis.actors.find((entry) => entry.name === name);
  assert.ok(result, `Missing actor ${name}`);
  return result;
};

test("reads standard damage, healing, target, cast and interrupt events", () => {
  const prefix = 'Player-1,"Mage",0x511,0x0,Creature-2,"Wolf",0x10a48,0x0';
  const healPrefix = 'Player-1,"Mage",0x511,0x0,Player-3,"Ally",0x511,0x0';
  const log = [
    `10/11 12:00:00.000 SPELL_CAST_SUCCESS,${prefix},123,"Fireball",0x4`,
    `10/11 12:00:01.000 SPELL_DAMAGE,${prefix},123,"Fireball",0x4,125,0,4,0,0,0,false,false,false`,
    `10/11 12:00:02.000 SWING_DAMAGE,${prefix},40,0,1,0,0,0,false,false,false`,
    `10/11 12:00:03.000 SPELL_HEAL,${healPrefix},456,"Heal",0x2,80,20,0,false`,
    `10/11 12:00:04.000 SPELL_PERIODIC_HEAL,${healPrefix},456,"Heal",0x2,15,0,0,false`,
    `10/11 12:00:05.000 SPELL_INTERRUPT,${prefix},1766,"Kick",0x1,116,"Frostbolt",0x10`,
    `10/11 12:00:06.000 UNIT_DIED,${prefix}`,
  ].join("\n");
  const analysis = analyzeCombatLog(log);
  const mage = actor(analysis, "Mage");
  assert.equal(analysis.events, 7);
  assert.equal(analysis.fights.length, 1);
  assert.equal(mage.damage, 165);
  assert.equal(mage.healing, 95);
  assert.equal(mage.overhealing, 20);
  assert.equal(mage.casts, 1);
  assert.equal(mage.interrupts, 1);
  assert.deepEqual(mage.targets, [{ id: "Creature-2", name: "Wolf", damage: 165 }]);
  assert.equal(mage.kind, "player");
  assert.equal(actor(analysis, "Wolf").kind, "other");
  assert.equal(actor(analysis, "Wolf").damageTaken, 165);
  assert.equal(actor(analysis, "Wolf").deaths, 1);
  assert.equal(actor(analysis, "Ally").healingReceived, 95);
  assert.equal(mage.abilities.find(({ name }) => name === "Fireball")?.damage, 125);
});

test("reads the advanced combat log amount after the extra unit fields", () => {
  const advanced = Array(17).fill("0").join(",");
  const log = [
    "10/11 12:00:00.000 COMBAT_LOG_VERSION,19,ADVANCED_LOG_ENABLED,1",
    `10/11 12:00:01.000 SPELL_DAMAGE,Player-1,"Mage",0x511,0x0,Creature-2,"Wolf",0x10a48,0x0,123,"Fireball",0x4,${advanced},55,0,4,0,0,0,false,false,false`,
  ].join("\n");
  assert.equal(actor(analyzeCombatLog(log), "Mage").damage, 55);
});

test("splits periods separated by at least thirty seconds", () => {
  const event = 'SPELL_DAMAGE,Player-1,"Mage",0x511,0x0,Creature-2,"Wolf",0x10a48,0x0,123,"Fireball",0x4,25,0,4,0,0,0,false,false,false';
  const result = analyzeCombatLog(`10/11 12:00:00.000 ${event}\n10/11 12:00:31.000 ${event}`);
  assert.equal(result.fights.length, 2);
  assert.equal(result.events, 2);
  assert.equal(actor(result, "Mage").damage, 50);
});

test("encounter boundaries name fights and keep long pauses inside the encounter", () => {
  const event = 'SPELL_DAMAGE,Player-1,"Mage",0x511,0x0,Creature-2,"Boss",0x10a48,0x0,123,"Fireball",0x4,25,0,4,0,0,0,false,false,false';
  const log = [
    '10/11 12:00:00.000 ENCOUNTER_START,1234,"Training Boss",1,5',
    `10/11 12:00:01.000 ${event}`,
    `10/11 12:00:40.000 ${event}`,
    '10/11 12:00:45.000 ENCOUNTER_END,1234,"Training Boss",1,5,1',
  ].join("\n");
  const result = analyzeCombatLog(log);
  assert.equal(result.fights.length, 1);
  assert.equal(result.fights[0].name, "Training Boss");
  assert.equal(result.fights[0].outcome, "kill");
  assert.equal(result.fights[0].durationSeconds, 45);
  assert.equal(actor(result.fights[0], "Mage").damage, 50);
});

test("environmental damage is assigned to the victim", () => {
  const log = '10/11 12:00:01.000 ENVIRONMENTAL_DAMAGE,0000000000000000,nil,0x80000000,0x0,Player-1,"Mage",0x511,0x0,FALLING,100,0,1,0,0,0,false,false,false';
  assert.equal(actor(analyzeCombatLog(log), "Mage").damageTaken, 100);
});

test("keeps same-name actors and targets separate by combat GUID", () => {
  const hit = (source, target, amount) =>
    `SPELL_DAMAGE,${source},"Mage",0x511,0x0,${target},"Wolf",0x10a48,0x0,123,"Fireball",0x4,${amount},0,4,0,0,0,false,false,false`;
  const result = analyzeCombatLog([
    `10/11 12:00:00.000 ${hit("Player-1", "Creature-1", 25)}`,
    `10/11 12:00:01.000 ${hit("Player-2", "Creature-2", 40)}`,
  ].join("\n"));
  assert.deepEqual(result.actors.filter(({ name }) => name === "Mage").map(({ id, damage }) => [id, damage]),
    [["Player-2", 40], ["Player-1", 25]]);
  assert.deepEqual(result.actors.filter(({ name }) => name === "Wolf").map(({ id, damageTaken }) => [id, damageTaken]),
    [["Creature-1", 25], ["Creature-2", 40]]);
  assert.deepEqual(result.actors.find(({ id }) => id === "Player-1")?.targets,
    [{ id: "Creature-1", name: "Wolf", damage: 25 }]);
});

test("keeps fight duration across a December to January log rollover", () => {
  const event = 'SPELL_DAMAGE,Player-1,"Mage",0x511,0x0,Creature-2,"Wolf",0x10a48,0x0,123,"Fireball",0x4,25,0,4,0,0,0,false,false,false';
  const result = analyzeCombatLog(`12/31 23:59:55.000 ${event}\n1/1 00:00:05.000 ${event}`);
  assert.equal(result.durationSeconds, 10);
  assert.equal(result.fights.length, 1);
});
