import type { GAME_SEED_DISCOVERIES } from "../../game-config";

type SeedDiscovery = (typeof GAME_SEED_DISCOVERIES)[number];

export const seedDiscoveryImagePath = (discovery: SeedDiscovery): string =>
  `/seed-discoveries/${discovery.edition}-${discovery.version.replaceAll(".", "-")}-${discovery.id}.webp`;
