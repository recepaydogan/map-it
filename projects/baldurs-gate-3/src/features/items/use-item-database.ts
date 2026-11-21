import { useEffect, useState } from "react";
import type { ItemDatabaseCatalog } from "./types";

interface ItemDatabaseState {
  data: ItemDatabaseCatalog | null;
  error: Error | null;
  loading: boolean;
}

let cachedCatalog: ItemDatabaseCatalog | null = null;
let catalogRequest: Promise<ItemDatabaseCatalog> | null = null;

const loadItemDatabase = () => {
  if (cachedCatalog) return Promise.resolve(cachedCatalog);
  if (!catalogRequest) {
    catalogRequest = fetch("/data/item-database.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Item database request failed with ${response.status}.`);
        return response.json() as Promise<ItemDatabaseCatalog>;
      })
      .then((data) => {
        cachedCatalog = data;
        return data;
      })
      .catch((error: unknown) => {
        catalogRequest = null;
        throw error;
      });
  }
  return catalogRequest;
};

export const useItemDatabase = (): ItemDatabaseState => {
  const [state, setState] = useState<ItemDatabaseState>(() => ({
    data: cachedCatalog,
    error: null,
    loading: cachedCatalog === null,
  }));

  useEffect(() => {
    if (cachedCatalog) return;
    let active = true;
    loadItemDatabase()
      .then((data) => {
        if (!active) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
};
