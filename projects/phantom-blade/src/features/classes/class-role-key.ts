const ROLE_KEYS: Record<string, string> = {
  "Melee DPS": "classGuide.roles.melee",
  "Ranged DPS": "classGuide.roles.ranged",
  "Caster DPS": "classGuide.roles.caster",
  Tank: "classGuide.roles.tank",
  Healer: "classGuide.roles.healer",
};

export const classRoleKey = (role: string): string | undefined => ROLE_KEYS[role];
