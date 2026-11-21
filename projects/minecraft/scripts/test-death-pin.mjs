import assert from "node:assert/strict";
import {
  isDeathSceneKey,
  formatDeathDate,
  countDeathPins,
  createDeathPinRecords,
  createDeathPinObserver,
} from "../src/features/worlds/world-death-pin.ts";
import { createGameSession } from "../src/features/game-session/session-types.ts";
import { GAME_EDITIONS } from "../src/game-config.ts";

let checks = 0;
const check = (name, run) => {
  const result = run();
  if (result instanceof Promise) {
    return result.then(() => {
      checks += 1;
      console.log(`PASS ${name}`);
    });
  }
  checks += 1;
  console.log(`PASS ${name}`);
  return Promise.resolve();
};

const mockT = (key, options) => {
  if (key === "worldDeathPin.name") return `Death ${options.count} · ${options.date}`;
  return key;
};

const makeSession = (patch = {}) => ({
  ...createGameSession("test-session", GAME_EDITIONS[0].gameClassId, GAME_EDITIONS[0].id),
  connected: true,
  registered: true,
  inWorld: true,
  dimension: "overworld",
  position: { x: 100.4, y: 64.2, z: -250.7, receivedAt: 1000, sequence: 1 },
  sceneKey: null,
  ...patch,
});

const makeMockRepository = (worldPins = [], edition = GAME_EDITIONS[0].id) => {
  let binding = {
    worldId: "world-1",
    generationKey: "gen-1",
    sessionId: "test-session",
    sessionGeneration: 0,
    sessionIdentity: JSON.stringify([null, null, null]),
    confirmedAt: 1000,
  };
  let world = {
    id: "world-1",
    edition,
    name: "Survival World",
    personal: {
      pins: [...worldPins],
      tracked: [],
      views: {},
    },
  };
  return {
    snapshot: async () => ({
      binding,
      worlds: [world],
      selectedId: "world-1",
    }),
    updateBoundPersonal: async (targetBinding, updater) => {
      world.personal = updater(world.personal);
      return world;
    },
    getWorld: () => world,
    setBinding: b => { binding = b; },
  };
};

await check("isDeathSceneKey recognizes Java and Bedrock death screens", () => {
  assert.ok(isDeathSceneKey("deathScreen.title"));
  assert.ok(isDeathSceneKey("deathScreen.title.hardcore"));
  assert.ok(isDeathSceneKey("deathScreen"));
  assert.ok(isDeathSceneKey("deathScreen.anything"));
  assert.ok(isDeathSceneKey("/gameplay/death"));
  assert.ok(isDeathSceneKey(" /gameplay/death "));
  assert.ok(!isDeathSceneKey("/gameplay/death_info"));
  assert.ok(!isDeathSceneKey(null));
  assert.ok(!isDeathSceneKey(""));
  assert.ok(!isDeathSceneKey("container.inventory"));
  assert.ok(!isDeathSceneKey("menu.game"));
});

await check("Bedrock death scene saves one pin and rearms after respawn", async () => {
  const bedrock = GAME_EDITIONS.find(edition => edition.id === "bedrock");
  assert.ok(bedrock);
  const repo = makeMockRepository([], bedrock.id);
  let nextId = 0;
  const observer = createDeathPinObserver({ repository: repo, t: mockT, newId: () => String(++nextId) });
  const session = patch => makeSession({ edition: bedrock.id, gameClassId: bedrock.gameClassId, ...patch });

  await observer.observe(session({ sceneKey: "InGame" }));
  const first = await observer.observe(session({ sceneKey: "/gameplay/death" }));
  assert.ok(first);
  assert.equal(first.dimension, "overworld");
  assert.equal(first.x, 100);
  assert.equal(first.z, -251);
  assert.equal(await observer.observe(session({ sceneKey: "/gameplay/death" })), null);
  assert.equal(await observer.observe(session({ sceneKey: "deathScreen.title" })), null);
  assert.equal(repo.getWorld().personal.pins.length, 1);

  await observer.observe(session({ sceneKey: "InGame", position: { x: 25, y: 70, z: 40, receivedAt: 2000, sequence: 2 } }));
  const second = await observer.observe(session({ sceneKey: "/gameplay/death", position: { x: 25, y: 70, z: 40, receivedAt: 2000, sequence: 2 } }));
  assert.ok(second);
  assert.equal(second.x, 25);
  assert.equal(repo.getWorld().personal.pins.length, 2);
});

await check("formatDeathDate formats short month and day", () => {
  const formatted = formatDeathDate(1716120000000, "en"); // May 19, 2024
  assert.ok(typeof formatted === "string" && formatted.length > 0);
  assert.ok(formatted.includes("May") || formatted.includes("19"));
});

await check("countDeathPins accurately counts danger pins with death prefix", () => {
  assert.equal(countDeathPins([]), 0);
  assert.equal(countDeathPins([
    { id: "custom-1", group: "general", icon: "pin", color: "sage", dimension: "overworld", name: "Base", note: "", x: 0, y: 0, z: 0 },
    { id: "death-pin-1", group: "danger", icon: "danger", color: "red", dimension: "overworld", name: "Death 1", note: "", x: 10, y: 64, z: 10 },
    { id: "death-pin-2", group: "danger", icon: "danger", color: "red", dimension: "nether", name: "Death 2", note: "", x: 5, y: 64, z: 5 },
  ]), 2);
});

await check("createDeathPinRecords rounds coordinates and enforces styles", () => {
  const { pin } = createDeathPinRecords({
    id: "death-pin-abc",
    count: 1,
    date: "May 19",
    dimension: "overworld",
    x: 120.7,
    y: 63.2,
    z: -340.9,
    t: mockT,
  });
  assert.equal(pin.id, "death-pin-abc");
  assert.equal(pin.name, "Death 1 · May 19");
  assert.equal(pin.x, 121);
  assert.equal(pin.y, 63);
  assert.equal(pin.z, -341);
  assert.equal(pin.icon, "danger");
  assert.equal(pin.color, "red");
  assert.equal(pin.group, "danger");
});

await check("createDeathPinObserver saves pin on deathScreen transition and de-duplicates", async () => {
  const repo = makeMockRepository();
  const savedPins = [];
  let currentId = 0;
  const observer = createDeathPinObserver({
    repository: repo,
    t: mockT,
    getLocale: () => "en",
    now: () => 1716120000000,
    newId: () => String(++currentId),
    onDeathPinSaved: pin => savedPins.push(pin),
  });

  // 1. Alive playing
  let session = makeSession({ sceneKey: null });
  assert.equal(await observer.observe(session), null);
  assert.equal(savedPins.length, 0);

  // 2. Dies -> deathScreen
  session = makeSession({ sceneKey: "deathScreen.title" });
  const pin1 = await observer.observe(session);
  assert.ok(pin1);
  assert.equal(pin1.name, "Death 1 · May 19");
  assert.equal(pin1.x, 100);
  assert.equal(pin1.y, 64);
  assert.equal(pin1.z, -251);
  assert.equal(savedPins.length, 1);
  assert.equal(repo.getWorld().personal.pins.length, 1);

  // 3. Remains on death screen -> NO duplicate pin
  assert.equal(await observer.observe(session), null);
  assert.equal(savedPins.length, 1);
  assert.equal(repo.getWorld().personal.pins.length, 1);

  // 4. Respawns -> alive again at spawn
  session = makeSession({
    sceneKey: null,
    position: { x: 0, y: 64, z: 0, receivedAt: 2000, sequence: 2 },
  });
  assert.equal(await observer.observe(session), null);
  assert.equal(savedPins.length, 1);

  // 5. Moves to a new spot and dies again
  session = makeSession({
    sceneKey: "deathScreen.title",
    position: { x: 50.8, y: 70, z: 200.2, receivedAt: 3000, sequence: 3 },
  });
  const pin2 = await observer.observe(session);
  assert.ok(pin2);
  assert.equal(pin2.name, "Death 2 · May 19");
  assert.equal(pin2.x, 51);
  assert.equal(pin2.z, 200);
  assert.equal(savedPins.length, 2);
  assert.equal(repo.getWorld().personal.pins.length, 2);
});

await check("createDeathPinObserver handles unbound session or world exit safely", async () => {
  const repo = makeMockRepository();
  repo.setBinding(null); // Unbound
  const observer = createDeathPinObserver({
    repository: repo,
    t: mockT,
  });

  const session = makeSession({ sceneKey: "deathScreen.title" });
  const result = await observer.observe(session);
  assert.equal(result, null);
  assert.equal(repo.getWorld().personal.pins.length, 0);
});

await check("cached startup coordinates cannot create a death pin", async () => {
  const repo = makeMockRepository();
  const observer = createDeathPinObserver({ repository: repo, t: mockT });
  await observer.observe(makeSession({ positionReady: false }));
  assert.equal(await observer.observe(makeSession({ positionReady: false, sceneKey: "deathScreen.title" })), null);
  assert.equal(repo.getWorld().personal.pins.length, 0);
  await observer.observe(makeSession({ positionReady: true }));
  assert.ok(await observer.observe(makeSession({ positionReady: true, sceneKey: "deathScreen.title" })));
});

console.log(`All ${checks} death-pin tests passed.`);
