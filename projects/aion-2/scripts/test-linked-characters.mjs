import assert from "node:assert/strict";
import { build } from "esbuild";

class MemoryStorage {
  #items = new Map();
  get length() { return this.#items.size; }
  key(index) { return [...this.#items.keys()][index] ?? null; }
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}

const rows = new Map();
let selectCount = 0;
const keyOf = (row) => JSON.stringify([row.user_id, row.region, row.server_id, row.character_id]);
globalThis.localStorage = new MemoryStorage();
globalThis.window = new EventTarget();
globalThis.mockSupabaseClient = {
  from(table) {
    assert.equal(table, "user_characters");
    return {
      async upsert(input) {
        for (const row of Array.isArray(input) ? input : [input]) {
          if (!rows.has(keyOf(row))) rows.set(keyOf(row), row);
        }
        return { error: null };
      },
      select() {
        return { eq(column, userId) {
          assert.equal(column, "user_id");
          return { async order() {
            selectCount += 1;
            return { data: [...rows.values()].filter((row) => row.user_id === userId), error: null };
          } };
        } };
      },
      update(values) {
        const filters = {};
        const chain = { eq(column, value) {
          filters[column] = value;
          if (column === "character_id") {
            for (const [key, row] of rows) if (Object.entries(filters).every(([field, expected]) => row[field] === expected)) rows.set(key, { ...row, ...values });
            return Promise.resolve({ error: null });
          }
          return chain;
        } };
        return chain;
      },
      delete() {
        const filters = {};
        const chain = { eq(column, value) {
          filters[column] = value;
          return chain;
        }, async select() {
          const deleted = [];
          for (const [key, row] of rows) if (Object.entries(filters).every(([field, expected]) => row[field] === expected)) {
            deleted.push({ character_id: row.character_id });
            rows.delete(key);
          }
          return { data: deleted, error: null };
        } };
        return chain;
      },
    };
  },
};

const compiled = await build({
  entryPoints: ["src/features/character-profiles/linked-characters.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "supabase-stub", setup(bundler) {
    bundler.onResolve({ filter: /supabase-client$/ }, () => ({ path: "supabase-client", namespace: "stub" }));
    bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const getSupabaseClient = () => globalThis.mockSupabaseClient;" }));
  } }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`;
const {
  addAccountCharacter, addGuestCharacter, characterKey, loadAccountLinkedCharacters,
  readGuestLinkedCharacters, removeAccountCharacter, removeGuestCharacter, saveAccountCharacterProfile, saveGuestCharacterProfile,
} = await import(moduleUrl);

const character = (id, serverId) => ({
  characterId: id, name: "Same name", level: 45, pcId: 4, race: 1,
  region: "eu", serverId, serverName: `Server ${serverId}`,
});
const first = character("first", 1001);
const second = character("second", 1002);
const third = character("third", 1003);
localStorage.setItem("character-profiles:last-character", JSON.stringify({ character: first, viewedAt: 100 }));
assert.equal(readGuestLinkedCharacters().length, 1, "Legacy character should migrate into the guest list.");
assert.notEqual(localStorage.getItem("character-profiles:linked-characters"), null,
  "Legacy import must record completion even if a profile remains saved.");
assert.notEqual(characterKey(first), characterKey(second), "Character identity includes the server and official ID.");
addGuestCharacter(second);
assert.equal(addGuestCharacter(first).length, 2, "Linking the same character must not duplicate it.");
assert.equal(removeGuestCharacter(second).length, 1);
addGuestCharacter(second);
const profileSnapshot = { profile: { characterName: "Same name", characterLevel: 45, className: "Ranger", combatPower: 1 },
  stats: [], rankings: [], titles: [], boards: [], equipment: [], skins: [], skills: [], petWing: {} };
saveGuestCharacterProfile(first, profileSnapshot);
assert.deepEqual(readGuestLinkedCharacters().find((entry) => characterKey(entry.character) === characterKey(first)).profileSnapshot, profileSnapshot);

assert.equal((await loadAccountLinkedCharacters("user-a")).length, 2, "Both guest characters must reach the account table.");
assert.equal(rows.size, 2);
assert.deepEqual(readGuestLinkedCharacters(), [], "A completed merge must not re-import the legacy key.");
assert.equal((await loadAccountLinkedCharacters("user-a")).length, 2);
assert.equal(selectCount, 1, "Reopening characters should reuse the cached account list.");
await addAccountCharacter("user-a", third);
assert.equal((await loadAccountLinkedCharacters("user-a")).length, 3);
await addAccountCharacter("user-b", second);
await removeAccountCharacter("user-a", second);
assert.equal((await loadAccountLinkedCharacters("user-a")).length, 2);
assert.equal(selectCount, 1, "Account mutations should update the cached list.");
await saveAccountCharacterProfile("user-a", first, profileSnapshot);
assert.deepEqual((await loadAccountLinkedCharacters("user-a")).find((entry) => characterKey(entry.character) === characterKey(first)).profileSnapshot, profileSnapshot);
assert.equal(selectCount, 1, "Saving a profile snapshot should update the cached row.");
assert.deepEqual((await loadAccountLinkedCharacters("user-b")).map((entry) => characterKey(entry.character)), [characterKey(second)],
  "Unlinking from one account must preserve a character linked by another account.");
assert.equal(selectCount, 2);
const restartedStorage = await import(`${moduleUrl}#restart`);
const restored = await restartedStorage.loadAccountLinkedCharacters("user-a");
assert.deepEqual(restored.find((entry) => restartedStorage.characterKey(entry.character) === restartedStorage.characterKey(first)).profileSnapshot, profileSnapshot,
  "A new app session should read the saved profile snapshot from the database.");
assert.equal(selectCount, 3);
await restartedStorage.removeAccountCharacter("user-a", first);
assert.deepEqual(await restartedStorage.loadAccountLinkedCharacters("user-a"),
  restored.filter((entry) => restartedStorage.characterKey(entry.character) !== restartedStorage.characterKey(first)));
assert.deepEqual(restartedStorage.readGuestLinkedCharacters(), [],
  "Unlinking must not restore the last viewed character on the next sign-in.");
await assert.rejects(restartedStorage.removeAccountCharacter("user-a", first), /not removed/,
  "An unmatched delete must not look successful.");
localStorage.removeItem("character-profiles:linked-characters");
const freshDevice = await import(`${moduleUrl}#fresh-device`);
const signedInAgain = await freshDevice.loadAccountLinkedCharacters("user-a");
assert.equal(signedInAgain.some((entry) => freshDevice.characterKey(entry.character) === freshDevice.characterKey(first)), false,
  "A saved last-viewed profile must not relink an account character on a fresh device.");
assert.deepEqual(freshDevice.readGuestLinkedCharacters(), []);

console.log("Linked character storage tests passed.");
