/**
 * The website's route to the Overwolf desktop build: one pitch, three parts.
 *
 * `GetAppButton` (desktop title bar) and `GetAppCard` (phone drawer) are the two
 * triggers; `GetAppDialog` is the single dialog they both open, mounted once at
 * the window root. Nothing here renders inside Overwolf.
 */
export { default as GetAppButton } from "./get-app-button";
export { default as GetAppCard } from "./get-app-card";
export { default as GetAppDialog } from "./get-app-dialog";
export { useGetApp, type GetAppSource } from "./get-app-store";
