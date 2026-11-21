import assert from "node:assert/strict";
import { GAME_EDITIONS, GAME_TELEMETRY } from "../src/game-config.ts";
import { createGameSession, getSessionStatus } from "../src/features/game-session/session-types.ts";
import { decodeStoredSession, parseGameSession } from "../src/features/game-session/session-validation.ts";
import { publishGameSession, readGameSessionState, SESSION_CHANGED_EVENT } from "../src/features/game-session/session-storage.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const rules = { coordinateLimit: GAME_TELEMETRY.coordinateLimit, editions: GAME_EDITIONS };
const fixture = (edition = GAME_EDITIONS[0]) => ({
  ...createGameSession("fixture-session", edition.gameClassId, edition.id),
  registered: true, inWorld: true, dimension: "surface", sequence: 1,
  position: { x: -20, y: 70, z: 30, receivedAt: 1000, sequence: 1 },
});

check("stored sessions round-trip both configured editions and discard unknown fields", () => {
  for (const edition of GAME_EDITIONS) {
    const input = fixture(edition);
    assert.deepEqual(decodeStoredSession(JSON.stringify(input), rules), input);
    const dirty = { ...input, chat: "private-chat", identity: { ...input.identity, path: "private-path" },
      position: { ...input.position, secret: "private-position" } };
    const parsed = parseGameSession(dirty, rules);
    assert.deepEqual(parsed, input);
    dirty.position.x = 999; dirty.identity.worldName = "mutated";
    assert.equal(parsed.position.x, -20);
    assert.equal(parsed.identity.worldName, null);
  }
});
check("session boundary rejects incompatible IDs, malformed state and unknown issues", () => {
  for (const patch of [
    { schemaVersion: 2 }, { id: " " }, { id: "x".repeat(513) }, { edition: "unknown" },
    { gameClassId: GAME_EDITIONS[1].gameClassId }, { connected: 1 }, { registered: "true" }, { inWorld: null },
    { generation: -1 }, { sequence: 1.5 }, { sequence: Number.MAX_SAFE_INTEGER + 1 }, { issue: "other" },
    { gameVersion: undefined }, { playerName: 4 }, { dimension: "" }, { biome: "x".repeat(513) },
    { sceneKey: "x".repeat(513) }, { sceneKey: 42 },
    { identity: null }, { identity: [] }, { identity: { worldName: "world" } },
  ]) assert.throws(() => parseGameSession({ ...fixture(), ...patch }, rules), /Invalid stored/);
  for (const issue of [null, "provider-error", "invalid-data", "missing-features"])
    assert.equal(parseGameSession({ ...fixture(), issue }, rules).issue, issue);
});
check("session position and orientation boundaries reject incomplete or invalid coordinates", () => {
  for (const patch of [{ x: Infinity }, { y: NaN }, { z: undefined }, { x: rules.coordinateLimit + 1 },
    { receivedAt: -1 }, { receivedAt: 0.5 }, { sequence: 0 }, { sequence: 2 }])
    assert.throws(() => parseGameSession({ ...fixture(), position: { ...fixture().position, ...patch } }, rules), /position/);
  for (const patch of [{ yaw: -1 }, { yaw: 360 }, { pitch: -91 }, { pitch: Infinity }])
    assert.throws(() => parseGameSession({ ...fixture(), ...patch }, rules), /Invalid stored/);
  assert.equal(parseGameSession({ ...fixture(), position: null, yaw: 0, pitch: -90 }, rules).position, null);
});
check("missing, malformed and oversized storage never become a fabricated session", () => {
  assert.equal(decodeStoredSession(null, rules), null);
  for (const input of ["", "{", "null", "[]", JSON.stringify({}), " ".repeat(32769)])
    assert.throws(() => decodeStoredSession(input, rules));
});
check("legacy facing remains undated and invalid facing timestamps are rejected", () => {
  const legacy = { ...fixture(), yaw: 90 }; delete legacy.facingReceivedAt;
  assert.equal(parseGameSession(legacy, rules).facingReceivedAt, null);
  for (const facingReceivedAt of [-1, 0.5, Infinity, "1000", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => parseGameSession({ ...fixture(), facingReceivedAt }, rules), /Invalid stored/);
  assert.equal(parseGameSession({ ...fixture(), facingReceivedAt: 1000 }, rules).facingReceivedAt, 1000);
});
check("clock rollback and stale updates never qualify as live", () => {
  for (const now of [999, 4001, NaN, Infinity]) assert.equal(getSessionStatus(fixture(), now, 3000), "stale");
  for (const now of [1000, 4000]) assert.equal(getSessionStatus(fixture(), now, 3000), "live");
  assert.equal(getSessionStatus({ ...fixture(), position: null }, 1000, 3000), "waiting");
  assert.equal(getSessionStatus({ ...fixture(), connected: false }, 1000, 3000), "disconnected");
});
check("startup position verification survives storage and rejects malformed flags", () => {
  for (const positionReady of [false, true]) {
    const input = { ...fixture(), positionReady };
    assert.deepEqual(decodeStoredSession(JSON.stringify(input), rules), input);
    assert.equal(getSessionStatus(input, 1000, 3000), positionReady ? "live" : "waiting");
  }
  for (const positionReady of [null, 1, "true", {}])
    assert.throws(() => parseGameSession({ ...fixture(), positionReady }, rules), /Invalid stored/);
});

// This harness uses an in-memory store and EventTarget, never a user's browser storage.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalError = console.error;
const values = new Map(), errors = [];
let failRead = false, failWrite = false, events = 0;
Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem(key) { if (failRead) throw new Error("fixture read failure"); return values.get(key) ?? null; },
  setItem(key, value) { if (failWrite) throw new Error("fixture write failure"); values.set(key, value); },
} });
window.addEventListener(SESSION_CHANGED_EVENT, () => events++);
console.error = (...args) => errors.push(args);
try {
  check("publication synchronizes allow-listed data and missing storage cannot resurrect it", () => {
    publishGameSession({ ...fixture(), chat: "private-chat" });
    assert.equal(events, 1);
    assert.deepEqual(readGameSessionState(), { session: fixture(), error: null });
    assert.equal(values.get(GAME_TELEMETRY.storageKey).includes("private-chat"), false);
    values.clear();
    assert.deepEqual(readGameSessionState(), { session: null, error: null });
  });
  check("invalid shared data fails closed and reports the error without rewriting it", () => {
    values.set(GAME_TELEMETRY.storageKey, "{broken");
    assert.deepEqual(readGameSessionState(), { session: null, error: "invalid-session" });
    assert.equal(values.get(GAME_TELEMETRY.storageKey), "{broken");
    assert.equal(errors.length, 1);
    publishGameSession(fixture());
    assert.equal(readGameSessionState().error, null);
  });
  check("read failure and write failure hide old data and successful publication recovers", () => {
    failRead = true;
    assert.deepEqual(readGameSessionState(), { session: null, error: "storage-unavailable" });
    failRead = false; failWrite = true;
    const before = events;
    publishGameSession({ ...fixture(), id: "replacement" });
    assert.equal(events, before + 1);
    assert.deepEqual(readGameSessionState(), { session: null, error: "storage-unavailable" });
    assert.equal(errors.length, 3);
    failWrite = false;
    publishGameSession({ ...fixture(), id: "replacement" });
    assert.equal(readGameSessionState().session.id, "replacement");
  });
} finally {
  console.error = originalError;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else delete globalThis.localStorage;
}
console.log(`${checks} session storage checks passed.`);
