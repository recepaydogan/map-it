import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";

export interface MerchantOffer {
  id: string;
  name: string;
  icon?: string;
  price: { amount: number; currency: string }[];
  level: number | null;
  useLevel?: number;
  bundle: number;
  limit: { count: number; duration: string; owner: string } | null;
}

export interface MerchantShopTab {
  name: string;
  race: string;
  items: MerchantOffer[];
}

interface MerchantShops {
  version: 1;
  npcShops: Record<string, { shop: string; race: string }>;
  shops: Record<string, { tabs: MerchantShopTab[]; reroll?: { costs: { amount: number; currency: string }[] } }>;
  currencies: Record<string, string>;
}

type MerchantShopState =
  | { status: "loading" }
  | { status: "ready"; data: MerchantShops }
  | { status: "error" };

let catalogPromise: Promise<MerchantShops> | null = null;

const loadCatalog = () => {
  catalogPromise ??= fetch(contentUrl(`data/merchant-shops.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Merchant shops: HTTP ${response.status}`);
    const data = await response.json() as MerchantShops;
    if (data.version !== 1 || !data.npcShops || !data.shops || !data.currencies) {
      throw new Error("Invalid merchant shop catalog");
    }
    return data;
  }).catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
};

export const useMerchantShops = (): MerchantShopState => {
  const [state, setState] = useState<MerchantShopState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void loadCatalog().then((data) => {
      if (active) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      console.error("Failed to load merchant shops", error);
      if (active) setState({ status: "error" });
    });
    return () => { active = false; };
  }, []);

  return state;
};
