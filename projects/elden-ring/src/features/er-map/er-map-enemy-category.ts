const ENEMY_CATEGORY_PREFIX = "enemy-";

// Teardrop scarabs and invaders are their own categories but remain enemies
// underneath — they keep the enemy-profile join (HP/resistances) and enemy
// portraits. Boss tiers (great-boss/legendary-boss) are NOT enemies: they get
// their data through the production twin like `boss` does.
export const isErMapEnemyCategory = (category?: string): boolean =>
  category === "enemy" ||
  category === "teardrop-scarab" ||
  category === "invasion" ||
  category === "elite-enemy" ||
  category?.startsWith(ENEMY_CATEGORY_PREFIX) === true;
