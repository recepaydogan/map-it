/**
 * Everything that makes this build a specific game's map app lives here.
 *
 * Branching the base for a new game starts with this file, then:
 *   - public/manifest.json — `meta.name`, `game_targeting` / `launch_events`
 *     game ids and `url_protocol.scheme` must match the values below
 *     (`npm run validate` checks that);
 *   - src/features/map/map-registry.ts — which maps the app ships;
 *   - src/features/map/map-config.ts — marker categories and their icons;
 *   - brand/icon-master.png — then `npm run build:icons`;
 *   - .env — the new app's own Supabase project and PostHog key.
 *
 * See docs/branching-guide.md for the full checklist.
 */
export interface GameConfig {
  /** Product name shown in the title bar, tray and store listing. */
  appName: string;
  /** Stable kebab-case identifier for app-specific storage and services. */
  appSlug: string;
  /** The game this companion is for, as shown in copy ("when {{game}} starts"). */
  gameName: string;
  /**
   * Overwolf game class ids the app reacts to. Every game callback fires for
   * ANY running game, so all game logic funnels through `isTargetGame`.
   * Must match `game_targeting.game_ids` in public/manifest.json.
   */
  gameClassIds: number[];
  /** Overwolf GEP feature groups requested while the target game is running. */
  gameEventFeatures: string[];
  /** Stable game-data identities that represent recruitable companion approval targets. */
  companionOriginIds: string[];
  /** Reviewed explanations of individual checks, keyed by stable check ID and language. */
  worldCheckDescriptions?: Record<string, Record<string, string>>;
  /** Fallback identity check on the running game's title. */
  gameTitlePattern: RegExp;
  /** The studio behind the game, for the legal notice. */
  developerName: string;
  /** Where the legal notice links to; empty hides the link. */
  developerTermsUrl: string;
  /** Discord invite shown in the title bar; empty hides the button. */
  discordInviteUrl: string;
  /** Public http(s) survey opened on uninstall; empty skips it. See docs/uninstall-survey.md. */
  uninstallSurveyUrl: string;
  /**
   * Custom URL scheme used as the OAuth redirect (`<scheme>://auth/callback`).
   * Must match `data.url_protocol.scheme` in public/manifest.json and be
   * allow-listed in Supabase → Auth → URL Configuration → Redirect URLs.
   */
  protocolScheme: string;
}

export const GAME_CONFIG: GameConfig = {
  appName: "Baldurs Gate 3 Map",
  appSlug: "baldurs-gate-map",
  gameName: "Baldur's Gate 3",
  gameClassIds: [22088],
  gameEventFeatures: ["game_info", "match_info", "location"],
  worldCheckDescriptions: {
    // Act1_UND_PetrifiedDrow.txt:287-338: post-combat roll and petrification-ray reaction.
    "skill-check:39ff8241-fadd-4fbe-ab89-fc5a8b7638a0:Arcana:625be976-7a67-4394-97c8-14c69715ae4b:UND_PetrifiedDrow_ArcanaCheckAboutSpectator": {
      en: "After defeating the Spectator, this check can let a nearby character comment on its petrification ray. It requires a surviving speaker who took part in combat and the petrified wizard not to have been freed. This reaction only runs once.",
      tr: "Spectator yenildikten sonra bu kontrol, yakındaki bir karakterin onun taşlaştırma ışını hakkında yorum yapmasını sağlayabilir. Savaşa katılmış, konuşabilecek durumda bir karakter gerekir ve taşlaşmış büyücünün kurtarılmamış olması gerekir. Bu tepki yalnızca bir kez tetiklenir.",
    },
  },
  companionOriginIds: [
    "3780c689-d903-41c2-bf64-1e6ec6a8e1e5",
    "35c3caad-5543-4593-be75-e7deba30f062",
    "b8b4a974-b045-45f6-9516-b457b8773abd",
    "fb3bc4c3-49eb-4944-b714-d0cb357bb635",
    "2bb39cf2-4649-4238-8d0c-44f62b5a3dfd",
    "efc9d114-0296-4a30-b701-365fc07d44fb",
    "a36281c5-adcd-4d6e-8e5a-b5650b8f17eb",
    "c1f137c7-a17c-47b0-826a-12e44a8ec45c",
    "e1b629bc-7340-4fe6-81a4-834a838ff5c5",
    "eae09670-869d-4b70-b605-33af4ee80b34",
  ],
  gameTitlePattern: /baldur(?:'|’)?s gate (?:3|iii)/i,
  developerName: "Larian Studios",
  developerTermsUrl: "https://larian.com/fan-content-policy",
  discordInviteUrl: "",
  uninstallSurveyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf1qJ3TvnsZfLQbq3pVGJB6piItW6VzOSdgrQ7UITa5G-TsxA/viewform",
  protocolScheme: "baldursgatemap",
};

/** The class id the manifest hotkeys are registered under. */
export const PRIMARY_GAME_CLASS_ID = GAME_CONFIG.gameClassIds[0]!;

/** Maps this game's native XYZ coordinates onto the generic horizontal plane. */
export const gameWorldPositionToLivePosition = (position: { x: number; y: number; z: number }) => ({
  x: position.x,
  y: position.y,
  z: position.z,
});

/** BG3 uses an all-zero player slot as a temporary "position unavailable" placeholder. */
export const isTrackableGameWorldPosition = (position: { x: number; y: number; z: number }) =>
  Math.abs(position.x) > 0.000_001
  || Math.abs(position.y) > 0.000_001
  || Math.abs(position.z) > 0.000_001;

/** Prefer the native local-player slot; use the camera only for unknown payload shapes. */
export const resolvePrimaryGamePlayerId = (
  players: Record<string, { x: number; y: number; z: number }>,
  camera?: { x: number; y: number; z: number } | null,
) => {
  const ids = Object.keys(players);
  if (ids.length === 0) return null;
  const explicit = ids.find((id) => /^(?:player[_-]?0|local[_-]?player|self|me)$/i.test(id));
  if (explicit) return explicit;
  if (!camera || ids.length === 1) return ids[0]!;
  return ids.reduce((closestId, id) => {
    const closest = players[closestId]!;
    const candidate = players[id]!;
    const closestDistance = Math.hypot(closest.x - camera.x, closest.y - camera.y);
    const candidateDistance = Math.hypot(candidate.x - camera.x, candidate.y - camera.y);
    return candidateDistance < closestDistance ? id : closestId;
  }, ids[0]!);
};

/**
 * Whether an Overwolf game-info payload describes the targeted game. Class id
 * is authoritative; the title regex is a fallback in case a callback ever
 * reports a numerically different id shape.
 */
export const isTargetGame = (
  gameInfo?: { classId?: number; title?: string } | null,
): boolean => {
  if (!gameInfo) return false;
  if (GAME_CONFIG.gameClassIds.includes(Number(gameInfo.classId))) return true;
  return GAME_CONFIG.gameTitlePattern.test(String(gameInfo.title ?? ""));
};
