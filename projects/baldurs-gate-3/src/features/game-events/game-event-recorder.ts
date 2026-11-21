import type { GameEventChannel, RecordedGameEvent } from "./game-event-types";

const DATABASE_NAME = "gm-game-events";
const STORE_NAME = "events";
const DATABASE_VERSION = 2;
const MAX_RECORDS = 100_000;
const PRUNE_INTERVAL = 500;

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue = Promise.resolve();

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId");
        store.createIndex("sequence", "sequence");
        store.createIndex("receivedAt", "receivedAt");
      } else {
        const store = request.transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains("receivedAt")) store.createIndex("receivedAt", "receivedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the game-event database."));
  });
  return databasePromise;
};

const requestResult = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Game-event database request failed."));
});

const pruneIfNeeded = async (database: IDBDatabase, sequence: number) => {
  if (sequence % PRUNE_INTERVAL !== 0) return;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const count = await requestResult(store.count());
  let remaining = Math.max(0, count - MAX_RECORDS);
  if (remaining === 0) return;
  await new Promise<void>((resolve, reject) => {
    const cursor = store.index("receivedAt").openCursor();
    cursor.onsuccess = () => {
      const value = cursor.result;
      if (!value || remaining <= 0) {
        resolve();
        return;
      }
      value.delete();
      remaining -= 1;
      value.continue();
    };
    cursor.onerror = () => reject(cursor.error ?? new Error("Could not prune the game-event log."));
  });
};

export const recordGameEvent = (record: RecordedGameEvent) => {
  writeQueue = writeQueue.then(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
    await pruneIfNeeded(database, record.sequence);
  }).catch((error) => {
    console.error("[Game events] Failed to persist a raw event.", error);
  });
  return writeQueue;
};

export const readRecordedGameEvents = async (sessionId?: string): Promise<RecordedGameEvent[]> => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const source = sessionId
    ? transaction.objectStore(STORE_NAME).index("sessionId")
    : transaction.objectStore(STORE_NAME);
  const records = await requestResult(sessionId ? source.getAll(sessionId) : source.getAll()) as RecordedGameEvent[];
  return records.sort((left, right) => left.receivedAt - right.receivedAt || left.sequence - right.sequence);
};

export const createGameEventLogBlob = async (sessionId?: string): Promise<Blob> => {
  const records = await readRecordedGameEvents(sessionId);
  return new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }, null, 2)], {
    type: "application/json",
  });
};

export const downloadGameEventLog = async (sessionId?: string): Promise<void> => {
  const blob = await createGameEventLogBlob(sessionId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `game-event-log-${sessionId ?? "all"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const createRecordedGameEvent = (
  sessionId: string,
  sequence: number,
  channel: GameEventChannel,
  payload: unknown,
): RecordedGameEvent => ({
  id: `${sessionId}:${String(sequence).padStart(9, "0")}`,
  sessionId,
  sequence,
  receivedAt: Date.now(),
  channel,
  payload,
});
