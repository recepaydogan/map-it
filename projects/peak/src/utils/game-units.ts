// PEAK renders altitude as world-Y × 1.6 (CharacterStats.unitsToMeters in the
// game assembly; summit = 1200 units = 1920 m). All stored telemetry and catalog
// elevations stay in raw world units — convert only when showing meters to the user.
export const GAME_UNITS_TO_METERS = 1.6;

export const unitsToMeters = (units: number): number => Math.round(units * GAME_UNITS_TO_METERS);
