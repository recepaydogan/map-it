export interface TerrainDirectoryIdentity {
  worldId: string;
  edition: string;
  version: string;
  dimension: string;
}

export interface TerrainDirectoryHandleRecord<T = unknown> extends TerrainDirectoryIdentity {
  schemaVersion: 1;
  id: string;
  handle: T;
  updatedAt: number;
}

export interface TerrainDirectoryHandleRepositoryOptions {
  factory: IDBFactory;
  name: string;
  now?: () => number;
}

const STORE = "handles", RECORD_LIMIT = 256;
const validText = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512;

export const terrainDirectoryIdentityKey = (identity: TerrainDirectoryIdentity) => {
  if (![identity.worldId, identity.edition, identity.version, identity.dimension].every(validText))
    throw new Error("Invalid terrain directory identity.");
  return JSON.stringify([identity.worldId, identity.edition, identity.version, identity.dimension]);
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Terrain directory database request failed."));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error("Terrain directory database transaction aborted."));
  transaction.onerror = () => undefined;
});

function assertRecord(value: unknown): asserts value is TerrainDirectoryHandleRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid terrain directory handle record.");
  const record = value as Partial<TerrainDirectoryHandleRecord>;
  if (record.schemaVersion !== 1 || !Number.isSafeInteger(record.updatedAt) || record.updatedAt! < 0 ||
    ![record.id, record.worldId, record.edition, record.version, record.dimension].every(validText) ||
    record.id !== terrainDirectoryIdentityKey(record as TerrainDirectoryIdentity) || !("handle" in record))
    throw new Error("Invalid terrain directory handle record.");
}

/** Stores browser-native directory handles only; save bytes and paths are never copied into this database. */
export const createTerrainDirectoryHandleRepository = ({ factory, name, now = Date.now }: TerrainDirectoryHandleRepositoryOptions) => {
  if (!factory || !validText(name)) throw new Error("Invalid terrain directory repository options.");
  let database: IDBDatabase | null = null, opening: Promise<IDBDatabase> | null = null, closed = false;
  const open = () => {
    if (closed) return Promise.reject(new Error("Terrain directory repository is closed."));
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onblocked = () => reject(new Error("Terrain directory database upgrade is blocked."));
      request.onerror = () => reject(request.error ?? new Error("Unable to open terrain directory database."));
      request.onsuccess = () => resolve(request.result);
    }).then(db => {
      if (closed) { db.close(); throw new Error("Terrain directory repository is closed."); }
      database = db;
      db.onversionchange = () => { db.close(); database = null; opening = null; };
      db.onclose = () => { database = null; opening = null; };
      return db;
    }).catch(error => { opening = null; throw error; });
    return opening;
  };
  const transact = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>) => {
    const transaction = (await open()).transaction(STORE, mode), completion = transactionDone(transaction);
    void completion.catch(() => undefined);
    try { const value = await work(transaction.objectStore(STORE)); await completion; return value; }
    catch (error) { try { transaction.abort(); } catch { /* The transaction may already be complete. */ }
      await completion.catch(() => undefined); throw error; }
  };
  return {
    async get<T = unknown>(identity: TerrainDirectoryIdentity): Promise<TerrainDirectoryHandleRecord<T> | null> {
      const id = terrainDirectoryIdentityKey(identity);
      const value: unknown = await transact("readonly", store => requestResult(store.get(id)));
      if (value === undefined) return null;
      assertRecord(value);
      if (value.id !== id) throw new Error("Terrain directory handle belongs to another context.");
      return value as TerrainDirectoryHandleRecord<T>;
    },
    async put<T>(identity: TerrainDirectoryIdentity, handle: T): Promise<TerrainDirectoryHandleRecord<T>> {
      const id = terrainDirectoryIdentityKey(identity), updatedAt = now();
      if (!Number.isSafeInteger(updatedAt) || updatedAt < 0 || handle === undefined)
        throw new Error("Invalid terrain directory handle write.");
      const record: TerrainDirectoryHandleRecord<T> = { schemaVersion: 1, id, ...identity, handle, updatedAt };
      await transact("readwrite", async store => {
        const count = await requestResult(store.count());
        if (count >= RECORD_LIMIT && await requestResult(store.getKey(id)) === undefined)
          throw new Error("Terrain directory handle limit reached.");
        await requestResult(store.put(record));
      });
      return record;
    },
    remove(identity: TerrainDirectoryIdentity): Promise<void> {
      const id = terrainDirectoryIdentityKey(identity);
      return transact("readwrite", async store => { await requestResult(store.delete(id)); });
    },
    removeWorld(worldId: string): Promise<void> {
      if (!validText(worldId)) return Promise.reject(new Error("Invalid terrain directory world identity."));
      return transact("readwrite", async store => {
        const records: unknown[] = await requestResult(store.getAll());
        for (const value of records) {
          assertRecord(value);
          if (value.worldId === worldId) await requestResult(store.delete(value.id));
        }
      });
    },
    close() { closed = true; database?.close(); database = null; opening = null; },
  };
};

export type TerrainDirectoryHandleRepository = ReturnType<typeof createTerrainDirectoryHandleRepository>;
