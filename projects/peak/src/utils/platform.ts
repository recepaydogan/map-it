export const IS_OVERWOLF = typeof overwolf !== "undefined";

export function openExternalUrl(url: string): void {
  if (IS_OVERWOLF) overwolf.utils.openUrlInDefaultBrowser(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
