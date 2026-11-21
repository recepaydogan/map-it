/**
 * The visually smoothed player position (world coordinates), written every
 * frame by the map marker and read by camera-follow logic, so the camera glides
 * with the marker instead of stepping with the raw 20 Hz samples.
 */
export const smoothedPlayerPosition = { x: 0, z: 0, heading: 0, valid: false }
