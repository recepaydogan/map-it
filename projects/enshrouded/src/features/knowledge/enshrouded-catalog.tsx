import type { ComponentProps } from "react";
import ItemCatalog from "../../components/layout/item-catalog";
import { GAME_CONFIG } from "../../game-config";

type EnshroudedCatalogProps = Omit<ComponentProps<typeof ItemCatalog>, "artwork" | "wordmark" | "gameName">;

export default function EnshroudedCatalog(props: EnshroudedCatalogProps) {
  return (
    <ItemCatalog {...props}
      artwork="/item-catalog-art.webp"
      wordmark="/item-catalog-logo.webp"
      gameName={GAME_CONFIG.gameName}
    />
  );
}
