/**
 * Portal root for popovers / dropdowns. Scoped to the non-ads content region
 * (id set in the shell) so floating UI never mounts over the Overwolf ad rail
 * — neither visually nor for pointer events (AGENTS.md ads constraint).
 */
export const PORTAL_ROOT_ID = "ow-portal-root";

export const getPortalRoot = (): HTMLElement =>
  document.getElementById(PORTAL_ROOT_ID) ?? document.body;
