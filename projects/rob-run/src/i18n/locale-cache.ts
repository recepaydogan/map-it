export interface LocaleCache {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
}

const DATABASE = "wow-forever-locales";
const STORE = "json";
let databaseRequest: Promise<IDBDatabase | undefined> | undefined;

function openDatabase(): Promise<IDBDatabase | undefined> {
  databaseRequest ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(undefined);
    let settled = false;
    const finish = (database?: IDBDatabase) => {
      if (settled) { database?.close(); return; }
      settled = true;
      clearTimeout(timeout);
      resolve(database);
    };
    const timeout = setTimeout(() => finish(), 1500);
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => finish();
      request.onblocked = () => finish();
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databaseRequest = undefined; };
        finish(database);
      };
    } catch { finish(); }
  });
  return databaseRequest;
}

/** Storage can be disabled or full without preventing a CDN download. */
export const localeCache: LocaleCache = {
  async read(key) {
    const database = await openDatabase();
    if (!database) return undefined;
    return new Promise((resolve) => {
      try {
        const transaction = database.transaction(STORE, "readonly");
        const request = transaction.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        transaction.onabort = transaction.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  },
  async write(key, value) {
    const database = await openDatabase();
    if (!database) return;
    return new Promise((resolve) => {
      try {
        const transaction = database.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).put(value, key);
        transaction.oncomplete = transaction.onabort = transaction.onerror = () => resolve();
      } catch { resolve(); }
    });
  },
};
