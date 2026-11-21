/**
 * Minimal promise-based IndexedDB key/value store. Works in windows and
 * dedicated workers alike; every failure degrades to "no cache" and is logged
 * once per call, never thrown, so callers can treat it as best-effort.
 */
export interface IndexedKvStore<T> {
  get(key: string): Promise<T | null>
  put(key: string, value: T): Promise<void>
  /** Every stored key, for callers that have to budget their own store. */
  keys(): Promise<string[]>
  delete(key: string): Promise<void>
}

export function createIndexedKvStore<T>(
  databaseName: string,
  storeName: string,
  isValue: (value: unknown) => value is T,
  label = databaseName,
): IndexedKvStore<T> {
  let databasePromise: Promise<IDBDatabase> | null = null

  const openDatabase = () => {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'))
        return
      }
      // Open at whatever version already exists on disk (a fixed number would
      // throw VersionError forever once any build has bumped it); only when the
      // store is missing is the database upgraded one step to add it.
      const ensureStore = (database: IDBDatabase) => {
        if (database.objectStoreNames.contains(storeName)) { resolve(database); return }
        const nextVersion = database.version + 1
        database.close()
        const upgrade = indexedDB.open(databaseName, nextVersion)
        upgrade.onupgradeneeded = () => {
          if (!upgrade.result.objectStoreNames.contains(storeName)) upgrade.result.createObjectStore(storeName)
        }
        upgrade.onsuccess = () => resolve(upgrade.result)
        upgrade.onerror = () => reject(upgrade.error)
        upgrade.onblocked = () => reject(new Error(`${databaseName} upgrade blocked by another open connection`))
      }
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
      }
      request.onsuccess = () => ensureStore(request.result)
      request.onerror = () => reject(request.error)
    })
    databasePromise.catch(() => { databasePromise = null })
    return databasePromise
  }

  return {
    async get(key) {
      try {
        const database = await openDatabase()
        return await new Promise<T | null>((resolve, reject) => {
          const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key)
          request.onsuccess = () => resolve(isValue(request.result) ? request.result : null)
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error(`[${label}] Failed to read`, error)
        return null
      }
    },
    async put(key, value) {
      try {
        const database = await openDatabase()
        await new Promise<void>((resolve, reject) => {
          const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error(`[${label}] Failed to store`, error)
      }
    },
    async keys() {
      try {
        const database = await openDatabase()
        return await new Promise<string[]>((resolve, reject) => {
          const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys()
          request.onsuccess = () => resolve(request.result.map(String))
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error(`[${label}] Failed to list keys`, error)
        return []
      }
    },
    async delete(key) {
      try {
        const database = await openDatabase()
        await new Promise<void>((resolve, reject) => {
          const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error(`[${label}] Failed to delete`, error)
      }
    },
  }
}
