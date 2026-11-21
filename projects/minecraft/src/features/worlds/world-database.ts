export const WORLD_STORES = ["worlds", "meta"];

export const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("World database request failed."));
});

/** Await transaction completion, not only request success: quota failures may abort later. */
export const transact = async <T>(db: IDBDatabase, mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>): Promise<T> => {
  const transaction = db.transaction(WORLD_STORES, mode);
  let pending = true;
  const completion = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => { pending = false; resolve(); };
    transaction.onabort = () => {
      pending = false;
      reject(transaction.error ?? new Error("World transaction aborted."));
    };
  });
  // The work promise can fail before completion is awaited; keep both failures observed.
  void completion.catch(() => undefined);
  try {
    const result = await work(transaction);
    await completion;
    return result;
  } catch (error) {
    if (pending) transaction.abort();
    await completion.catch(() => undefined);
    throw error;
  }
};

export const openWorldDatabase = (factory: IDBFactory, name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("worlds", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("World database upgrade is blocked by another app window."));
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open world database."));
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      resolve(request.result);
    };
  });
