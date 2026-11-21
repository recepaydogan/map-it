export interface ReleaseNote {
  version: string;
  publishedAt: string;
  translationKey: string;
  modNames: string[];
  highlightedTextKey?: string;
}

/** Newest first. Keep release copy in the English locale, not in this catalog. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2.2.0",
    publishedAt: "2026-09-28",
    translationKey: "updates.releases.v220",
    modNames: ["Greenport, KY (B42)", "Maplewood"],
  },
  {
    version: "2.0.4",
    publishedAt: "2026-09-13",
    translationKey: "updates.releases.v204",
    modNames: ["Snake's ModPack Build 42"],
  },
  {
    version: "2.0.3",
    publishedAt: "2026-09-10",
    translationKey: "updates.releases.v203",
    highlightedTextKey: "updates.releases.v203.highlight",
    modNames: ["Fort Benning B42", "Nellis Air Force Base"],
  },
  {
    version: "2.0.2",
    publishedAt: "2026-09-06",
    translationKey: "updates.releases.v202",
    modNames: ["West Point Expansion B42"],
  },
  {
    version: "2.0.0",
    publishedAt: "2026-09-02",
    translationKey: "updates.releases.v200",
    modNames: [],
  },
  {
    version: "1.0.9",
    publishedAt: "2026-09-01",
    translationKey: "updates.releases.v109",
    modNames: ["SecretZ Pandemic (Alpha)"],
  },
  {
    version: "1.0.8",
    publishedAt: "2026-08-31",
    translationKey: "updates.releases.v108",
    modNames: ["Vila Z", "Fort Preston"],
  },
];

export const LATEST_RELEASE_VERSION = RELEASE_NOTES[0].version;
