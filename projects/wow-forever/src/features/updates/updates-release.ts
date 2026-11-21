import manifest from "../../../public/manifest.json" with { type: "json" };
import english from "../../i18n/locales/en.json" with { type: "json" };

const compareVersions = (left: string, right: string): number => {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
};

/** A patch without new notes keeps displaying the latest published notes. */
export const resolveUpdatesVersion = (appVersion: string, releases: readonly { version: string; items: readonly unknown[] }[]): string =>
  releases.filter(release => /^\d+\.\d+\.\d+$/.test(release.version)
    && release.items.length > 0 && compareVersions(release.version, appVersion) <= 0)
    .map(release => release.version).sort(compareVersions).at(-1) ?? appVersion;

export const UPDATES_VERSION = resolveUpdatesVersion(manifest.meta.version, Object.values(english.updates.releases));
