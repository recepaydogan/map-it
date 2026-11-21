import type { CommunityMapAsset, InstalledCommunityMap, PreparedCommunityMapPackage } from "./community-map-types";

const DATABASE_NAME = "pzim-community-maps";
const DATABASE_VERSION = 1;
const PACKAGE_STORE = "packages";
const ASSET_STORE = "assets";
const PACKAGE_INDEX = "packageKey";

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
});

const transactionComplete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
});

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PACKAGE_STORE)) {
      database.createObjectStore(PACKAGE_STORE, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(ASSET_STORE)) {
      const assets = database.createObjectStore(ASSET_STORE, { keyPath: "key" });
      assets.createIndex(PACKAGE_INDEX, "packageKey", { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Community map database could not be opened."));
});

const deletePackageAssets = (store: IDBObjectStore, packageKey: string) => new Promise<void>((resolve, reject) => {
  const request = store.index(PACKAGE_INDEX).openKeyCursor(IDBKeyRange.only(packageKey));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      resolve();
      return;
    }
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
  request.onerror = () => reject(request.error ?? new Error("Community map assets could not be removed."));
});

export const listInstalledCommunityMaps = async () => {
  const database = await openDatabase();
  try {
    return await requestResult(database.transaction(PACKAGE_STORE, "readonly").objectStore(PACKAGE_STORE).getAll()) as InstalledCommunityMap[];
  } finally {
    database.close();
  }
};

export const installCommunityMap = async ({ record, assets }: PreparedCommunityMapPackage) => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PACKAGE_STORE, ASSET_STORE], "readwrite");
    const packageStore = transaction.objectStore(PACKAGE_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    await deletePackageAssets(assetStore, record.key);
    packageStore.put(record);
    for (const asset of assets) assetStore.put(asset);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
};

export const removeCommunityMap = async (packageKey: string) => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PACKAGE_STORE, ASSET_STORE], "readwrite");
    transaction.objectStore(PACKAGE_STORE).delete(packageKey);
    await deletePackageAssets(transaction.objectStore(ASSET_STORE), packageKey);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
};

export const getCommunityMapAsset = async (packageKey: string, path: string) => {
  const database = await openDatabase();
  try {
    const asset = await requestResult(
      database.transaction(ASSET_STORE, "readonly").objectStore(ASSET_STORE).get(`${packageKey}/${path}`),
    ) as CommunityMapAsset | undefined;
    return asset?.blob ?? null;
  } finally {
    database.close();
  }
};
