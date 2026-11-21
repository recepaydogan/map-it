/**
 * Nightreign per-expedition "Special Events" — the day-specific twists a pattern can carry
 * (roaming hordes, meteor storms, an Omen-King invasion …). The pattern data only stores the
 * raw label ("Day 2 Meteor Strike"); this maps each to what it actually does so the seed bar
 * can tell the player what this run throws at them. Descriptions are the real, documented NR
 * mechanics — kept honest where a Nightlord-themed hazard's specifics aren't fully pinned down.
 */

export interface NrEvent {
  /** The in-game day the twist fires on (before that night), when the label carries one. */
  day?: 1 | 2;
  /** Base event name with the "Day N" prefix stripped. */
  name: string;
  description: string;
}

const EVENT_DESC: Record<string, string> = {
  "Night Horde":
    "A roaming horde of enemies sweeps the map this day. Clearing it is dangerous but yields extra runes and loot to power your team up before nightfall.",
  "Meteor Strike":
    "Meteors bombard a stretch of the map, scarring the terrain. The impact zone turns hazardous but can carve new routes and expose loot.",
  "Morgott Invasion":
    "Morgott, the Omen King, prowls the map as an elite roaming field boss. High risk — but bringing him down is a major power spike.",
  "Extra Night Boss":
    "An additional boss joins the night phase, raising the night's difficulty and its rewards alike.",
  "Maris Bubbles":
    "A Maris-themed hazard: drifting bubbles roam an area of the map, foreshadowing the Augur Nightlord. Contact risks Sleep build-up.",
  "Frenzy Tower":
    "A tower channels the Frenzied Flame, radiating madness build-up to anyone who lingers near it. Approach from range or move through quickly.",
  "Gnoster Plague":
    "A Gnoster-themed plague of pestilence spreads through a region — standing in it drains your health with poison and rot.",
  "Libra Curse":
    "A Libra-themed curse warps the balance of an area, applying the Equilibrious Beast's affliction to those caught inside.",
  "Difficult Sorcerer's Rise":
    "The map's Sorcerer's Rise hides a tougher puzzle and guardian than usual — solving it grants a stronger reward.",
  "Walking Mausoleum":
    "A Walking Mausoleum lumbers across the map. Bring down its legs and ring its bell to claim the boss reward sealed inside.",
};

/** Parse a raw pattern event label into a structured event, or null for "empty"/none. */
export const parseNrEvent = (raw: string | undefined): NrEvent | null => {
  if (!raw || raw === "empty") return null;
  const m = raw.match(/^Day ([12]) (.+)$/);
  const day = m ? (Number(m[1]) as 1 | 2) : undefined;
  const name = m ? m[2] : raw;
  return { day, name, description: EVENT_DESC[name] ?? "A special twist unique to this expedition." };
};
