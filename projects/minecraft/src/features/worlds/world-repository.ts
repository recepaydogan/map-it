import { requireNumericSeed } from "./seed-value.ts";
import { createRuntimeId } from "../../lib/runtime-id.ts";
import { openWorldDatabase, requestResult, transact } from "./world-database.ts";
import { assertWorldRecord, assertWorldSelection } from "./world-validation.ts";
import { parseWorldBinding } from "./world-binding-validation.ts";
import { accountDeviceStateKey, captureWorldDeviceState, parseWorldDeviceState, restoreWorldDeviceState } from "./world-device-state.ts";
import { confirmSessionWorld, sessionAssociation, type WorldSessionBinding } from "./world-session-binding.ts";
import type { GameSession } from "../game-session/session-types.ts";
import { emptyPersonalState, generationKey, orderWorlds, type NewWorld, type WorldAssociation,
  type WorldLibrarySnapshot, type WorldPersonalState, type WorldRecord,
  type WorldSelection } from "./world-types.ts";

export interface WorldRepositoryOptions {
  name: string;
  factory: IDBFactory;
  now?: () => number;
  newId?: () => string;
  onCommit?: () => void;
}

export class WorldBindingChangedError extends Error {
  constructor() { super("World session binding changed before the personal update."); this.name = "WorldBindingChangedError"; }
}

const readSelection = async (tx: IDBTransaction): Promise<WorldSelection> => {
  const value: unknown = await requestResult(tx.objectStore("meta").get("selection"));
  if (value === undefined) return { id: "selection", worldId: null, revision: 0 };
  assertWorldSelection(value);
  return value;
};

const readWorld = async (tx: IDBTransaction, id: string): Promise<WorldRecord> => {
  const value: unknown = await requestResult(tx.objectStore("worlds").get(id));
  if (value === undefined) throw new Error(`World no longer exists: ${id}`);
  assertWorldRecord(value);
  return value;
};

const readWorlds = async (tx: IDBTransaction): Promise<WorldRecord[]> => {
  const values: unknown[] = await requestResult(tx.objectStore("worlds").getAll());
  return values.map(value => { assertWorldRecord(value); return value; });
};

const readBinding = async (tx: IDBTransaction): Promise<WorldSessionBinding | null> => {
  const value: unknown = await requestResult(tx.objectStore("meta").get("session-binding"));
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || !("binding" in value)) throw new Error("Invalid stored binding record.");
  return parseWorldBinding(value.binding);
};

/** Transactional read-modify-write prevents desktop/overlay edits losing each other. */
export const createWorldRepository = (options: WorldRepositoryOptions) => {
  let opening: Promise<IDBDatabase> | null = null;
  let database: IDBDatabase | null = null;
  let closed = false;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? createRuntimeId;
  const open = () => {
    if (closed) return Promise.reject(new Error("World repository is closed."));
    if (!opening) opening = openWorldDatabase(options.factory, options.name).then(db => {
      if (closed) { db.close(); throw new Error("World repository is closed."); }
      database = db;
      db.onversionchange = () => { db.close(); database = null; opening = null; };
      db.onclose = () => { database = null; opening = null; };
      return db;
    }).catch(error => { opening = null; throw error; });
    return opening;
  };
  const write = async <T>(work: (tx: IDBTransaction) => Promise<T>): Promise<T> => {
    const result = await transact(await open(), "readwrite", work);
    options.onCommit?.();
    return result;
  };
  const updateWorld = (id: string, change: (record: WorldRecord) => WorldRecord) => write(async tx => {
    const current = await readWorld(tx, id);
    const next = change(current);
    assertWorldRecord(next);
    await requestResult(tx.objectStore("worlds").put(next));
    return next;
  });
  return {
    /** Selection, creation/profile migration and binding commit as one cancellable transaction. */
    connectSessionWorld(input: { worldId?: string; create?: NewWorld; version?: string;
      selectionRevision: number; session: GameSession; confirmedAt: number }, isCurrent: () => boolean) {
      const copy = structuredClone(input);
      return write(async tx => {
        const selection = await readSelection(tx);
        if (!isCurrent() || selection.revision !== copy.selectionRevision) throw new WorldBindingChangedError();
        let world: WorldRecord;
        if (copy.worldId) world = await readWorld(tx, copy.worldId);
        else {
          if (!copy.create) throw new Error("Missing world creation descriptor.");
          world = { ...copy.create, generation: { ...copy.create.generation, seed: requireNumericSeed(copy.create.generation.seed) },
            schemaVersion: 1, id: newId(), association: null, favorite: false, createdAt: now(), lastOpenedAt: now(),
            movedToBottomAt: null, personal: emptyPersonalState() };
        }
        if (copy.version) world = { ...world, generation: { ...world.generation, version: copy.version } };
        const binding = confirmSessionWorld(world, copy.session, copy.confirmedAt);
        world = { ...world, association: sessionAssociation(copy.session, copy.confirmedAt),
          lastOpenedAt: Math.max(world.lastOpenedAt, now()), movedToBottomAt: null };
        assertWorldRecord(world);
        await requestResult(tx.objectStore("worlds").put(world));
        await requestResult(tx.objectStore("meta").put({ ...selection, worldId: world.id, revision: selection.revision + 1 }));
        await requestResult(tx.objectStore("meta").put({ id: "session-binding", binding }));
        if (!isCurrent()) throw new WorldBindingChangedError();
        return world;
      });
    },
    async snapshot(): Promise<WorldLibrarySnapshot> {
      return transact(await open(), "readonly", async tx => {
        const worlds = orderWorlds(await readWorlds(tx));
        const selection = await readSelection(tx);
        if (selection.worldId !== null && !worlds.some(world => world.id === selection.worldId)) {
          throw new Error("Selected world is missing from the library.");
        }
        return { worlds, selection, binding: await readBinding(tx) };
      });
    },
    async get(id: string): Promise<WorldRecord> {
      return transact(await open(), "readonly", tx => readWorld(tx, id));
    },
    /** Adds the first-run example once; deleting it later never recreates it. */
    async initializeExampleWorld(input: NewWorld, id: string, initializedMetaId: string): Promise<WorldRecord | null> {
      const draft = structuredClone(input);
      const at = now();
      const world: WorldRecord = {
        schemaVersion: 1, id, name: draft.name.trim(), edition: draft.edition,
        generation: { ...draft.generation, seed: requireNumericSeed(draft.generation.seed) },
        association: null, favorite: false, createdAt: at, lastOpenedAt: at,
        movedToBottomAt: null, personal: emptyPersonalState(),
      };
      assertWorldRecord(world);
      if (!initializedMetaId.trim()) return Promise.reject(new Error("Invalid example-world marker."));
      const initialized: unknown = await transact(await open(), "readonly", tx =>
        requestResult(tx.objectStore("meta").get(initializedMetaId)));
      if (initialized !== undefined) return null;
      return write(async tx => {
        const marker: unknown = await requestResult(tx.objectStore("meta").get(initializedMetaId));
        if (marker !== undefined) return null;
        const worlds = await readWorlds(tx);
        await requestResult(tx.objectStore("meta").put({ id: initializedMetaId, initialized: true }));
        if (worlds.length > 0) return null;
        await requestResult(tx.objectStore("worlds").add(world));
        const selection = await readSelection(tx);
        await requestResult(tx.objectStore("meta").put({
          ...selection, worldId: world.id, revision: selection.revision + 1,
        }));
        return world;
      });
    },
    /**
     * Replace account-owned world data while retaining device-only associations,
     * cameras and filters for worlds that still exist. Cloud payloads never get
     * to choose those local fields.
     */
    replaceAccountWorlds(worlds: WorldRecord[], userId?: string, isCurrent: () => boolean = () => true): Promise<void> {
      const copies = structuredClone(worlds);
      for (const world of copies) assertWorldRecord(world);
      if (new Set(copies.map(world => world.id)).size !== copies.length) {
        return Promise.reject(new Error("Duplicate world identity in account data."));
      }
      return write(async tx => {
        const existing = await readWorlds(tx);
        const owner = await requestResult<{ userId: string | null } | undefined>(tx.objectStore("meta").get("device-account-owner"));
        const changedAccount = !!userId && !!owner?.userId && userId !== owner.userId;
        if (changedAccount && existing.length) await requestResult(tx.objectStore("meta").put(
          captureWorldDeviceState(owner.userId!, { worlds: existing, selection: await readSelection(tx) })));
        const current = new Map((changedAccount ? [] : existing).map(world => [world.id, world]));
        const device = userId ? parseWorldDeviceState(
          await requestResult(tx.objectStore("meta").get(accountDeviceStateKey(userId))), userId) : null;
        const saved = new Map(device?.worlds.map(world => [world.id, world]));
        const next = copies.map(world => {
          const local = current.get(world.id);
          const clean: WorldRecord = { ...world, association: null, personal: { ...world.personal, views: {}, resume: undefined } };
          const merged = restoreWorldDeviceState(clean, local ?? saved.get(world.id));
          assertWorldRecord(merged);
          return merged;
        });
        const worldStore = tx.objectStore("worlds");
        await requestResult(worldStore.clear());
        for (const world of next) await requestResult(worldStore.put(world));

        const ids = new Set(next.map(world => world.id));
        const selection = await readSelection(tx);
        const selectedId = !changedAccount && selection.worldId && ids.has(selection.worldId)
          ? selection.worldId
          : device?.selectionId && ids.has(device.selectionId) ? device.selectionId : orderWorlds(next)[0]?.id ?? null;
        await requestResult(tx.objectStore("meta").put({
          ...selection,
          worldId: selectedId,
          revision: selection.revision + 1,
        }));
        if (userId) await requestResult(tx.objectStore("meta").put({ id: "device-account-owner", userId }));

        const binding = await readBinding(tx);
        if (binding) {
          const bound = next.find(world => world.id === binding.worldId);
          if (changedAccount || !bound || generationKey(bound) !== binding.generationKey) {
            await requestResult(tx.objectStore("meta").delete("session-binding"));
          }
        }
        if (!isCurrent()) throw new WorldBindingChangedError();
      });
    },
    /** Remove every account-owned world record and its local selection/binding. */
    clearAccountWorlds(userId?: string): Promise<boolean> {
      return write(async tx => {
        if (userId) {
          const owner = await requestResult<{ userId: string | null } | undefined>(tx.objectStore("meta").get("device-account-owner"));
          // A late sign-out from another window must not clear a newly active account.
          if (owner?.userId && owner.userId !== userId) return false;
          const snapshot = { worlds: await readWorlds(tx), selection: await readSelection(tx) };
          // All app windows observe sign-out; subsequent empty clears preserve the backup.
          if (snapshot.worlds.length) await requestResult(tx.objectStore("meta").put(captureWorldDeviceState(userId, snapshot)));
        }
        await requestResult(tx.objectStore("worlds").clear());
        await requestResult(tx.objectStore("meta").delete("selection"));
        await requestResult(tx.objectStore("meta").delete("session-binding"));
        await requestResult(tx.objectStore("meta").put({ id: "device-account-owner", userId: null }));
        return true;
      });
    },
    create(input: NewWorld, behavior: { select?: boolean } = {}): Promise<WorldRecord> {
      // Clone before waiting for the database; caller edits must not change pending writes.
      const draft = structuredClone(input);
      const select = behavior.select !== false;
      const at = now();
      const world: WorldRecord = {
        schemaVersion: 1, id: newId(), name: draft.name.trim(), edition: draft.edition,
        generation: { ...draft.generation, seed: requireNumericSeed(draft.generation.seed) },
        association: null, favorite: false, createdAt: at, lastOpenedAt: at,
        movedToBottomAt: null, personal: emptyPersonalState(),
      };
      assertWorldRecord(world);
      return write(async tx => {
        await requestResult(tx.objectStore("worlds").add(world));
        if (select) {
          const selection = await readSelection(tx);
          await requestResult(tx.objectStore("meta").put({
            ...selection, worldId: world.id, revision: selection.revision + 1,
          }));
        }
        return world;
      });
    },
    select(id: string): Promise<WorldRecord> {
      return write(async tx => {
        const world = await readWorld(tx, id);
        const next = { ...world, lastOpenedAt: Math.max(world.lastOpenedAt, now()), movedToBottomAt: null };
        await requestResult(tx.objectStore("worlds").put(next));
        const selection = await readSelection(tx);
        await requestResult(tx.objectStore("meta").put({
          ...selection, worldId: id, revision: selection.revision + 1,
        }));
        return next;
      });
    },
    rename(id: string, name: string) {
      return updateWorld(id, world => ({ ...world, name: name.trim() }));
    },
    setFavorite(id: string, favorite: boolean) {
      return updateWorld(id, world => ({ ...world, favorite }));
    },
    moveToBottom(id: string) {
      return write(async tx => {
        const world = await readWorld(tx, id);
        const worlds = await readWorlds(tx);
        const latest = worlds.reduce((at, item) => Math.max(at, item.movedToBottomAt ?? 0), 0);
        const next = { ...world, movedToBottomAt: Math.max(now(), latest + 1) };
        assertWorldRecord(next);
        await requestResult(tx.objectStore("worlds").put(next));
        return next;
      });
    },
    setAssociation(id: string, association: WorldAssociation | null) {
      const copy = structuredClone(association);
      return updateWorld(id, world => ({ ...world, association: copy }));
    },
    /** Retain local world data when a newer map profile becomes available. */
    updateGenerationVersion(id: string, expectedVersion: string, version: string): Promise<WorldRecord> {
      return write(async tx => {
        const world = await readWorld(tx, id);
        if (world.generation.version !== expectedVersion) throw new Error("World generator changed before profile update.");
        const next = { ...world, generation: { ...world.generation, version } };
        assertWorldRecord(next);
        await requestResult(tx.objectStore("worlds").put(next));
        if ((await readBinding(tx))?.worldId === id) await requestResult(tx.objectStore("meta").delete("session-binding"));
        return next;
      });
    },
    /** Atomic selection/generator check prevents a delayed confirmation binding a different world. */
    bindSession(binding: WorldSessionBinding, selectionRevision: number, association: WorldAssociation | null = null,
      isCurrent: () => boolean = () => true) {
      const copy = parseWorldBinding(binding), hint = structuredClone(association);
      return write(async tx => {
        const selection = await readSelection(tx);
        if (selection.worldId !== copy.worldId || selection.revision !== selectionRevision) throw new Error("Selected world changed before confirmation.");
        const world = await readWorld(tx, copy.worldId);
        if (generationKey(world) !== copy.generationKey) throw new Error("World generator changed before confirmation.");
        if (hint) {
          const next = { ...world, association: hint }; assertWorldRecord(next);
          await requestResult(tx.objectStore("worlds").put(next));
        }
        await requestResult(tx.objectStore("meta").put({ id: "session-binding", binding: copy }));
        if (!isCurrent()) throw new WorldBindingChangedError();
        return copy;
      });
    },
    clearSessionBinding(expected: WorldSessionBinding) {
      const copy = parseWorldBinding(expected);
      return write(async tx => {
        const current = await readBinding(tx);
        if (!current || JSON.stringify(current) !== JSON.stringify(copy)) throw new Error("Session binding changed before unlinking.");
        await requestResult(tx.objectStore("meta").delete("session-binding"));
      });
    },
    /** Callback must be synchronous and pure; it runs against the latest committed state. */
    updatePersonal(id: string, change: (personal: WorldPersonalState) => WorldPersonalState) {
      return updateWorld(id, world => ({ ...world, personal: change(world.personal) }));
    },
    /** Atomically protects session-originated personal data from a concurrent rebind or generator change. */
    updateBoundPersonal(expected: WorldSessionBinding, change: (personal: WorldPersonalState) => WorldPersonalState,
      isCurrent: () => boolean = () => true) {
      const copy = parseWorldBinding(expected);
      return write(async tx => {
        const current = await readBinding(tx);
        if (!current || JSON.stringify(current) !== JSON.stringify(copy)) throw new WorldBindingChangedError();
        const world = await readWorld(tx, copy.worldId);
        if (generationKey(world) !== copy.generationKey) throw new WorldBindingChangedError();
        const next = { ...world, personal: change(world.personal) };
        assertWorldRecord(next);
        await requestResult(tx.objectStore("worlds").put(next));
        if (!isCurrent()) throw new WorldBindingChangedError();
        return next;
      });
    },
    /** Called only after UI disclosure/confirmation. Never accesses or deletes game saves. */
    forget(id: string): Promise<void> {
      return write(async tx => {
        await readWorld(tx, id);
        await requestResult(tx.objectStore("worlds").delete(id));
        if ((await readBinding(tx))?.worldId === id) await requestResult(tx.objectStore("meta").delete("session-binding"));
        const selection = await readSelection(tx);
        if (selection.worldId !== id) return;
        const remaining = orderWorlds(await readWorlds(tx));
        await requestResult(tx.objectStore("meta").put({
          ...selection, worldId: remaining[0]?.id ?? null, revision: selection.revision + 1,
        }));
      });
    },
    close() { closed = true; database?.close(); database = null; },
  };
};

export type WorldRepository = ReturnType<typeof createWorldRepository>;
