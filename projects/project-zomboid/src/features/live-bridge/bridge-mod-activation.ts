/**
 * Turning the Bridge mod ON, so the player never has to.
 *
 * Copying the mod into `…\Zomboid\mods` is only half the job: Project Zomboid
 * ignores a mod that isn't in the active mod list, and asking a player to walk
 * Main Menu > Mods > Activate is exactly where live position used to die. The
 * list is plain text, so we can tick the box for them.
 *
 * Two files carry that list, both in the same format:
 *  - `mods\default.txt` — the main-menu list, used by every NEW game.
 *  - `Saves\<mode>\<save>\mods.txt` — a per-save copy, used when a game already
 *    in progress is continued. Writing only default.txt would leave every
 *    existing survivor without a live position.
 *
 *     VERSION = 1,
 *
 *     mods
 *     {
 *         mod = SomeModId,
 *     }
 *
 *     maps
 *     {
 *     }
 *
 * The `maps` block is for map mods only — the Bridge is a client-side Lua mod,
 * so it belongs in `mods` and nowhere else.
 */

export const BRIDGE_MOD_ID = "ProjectZomboidInteractiveMapBridge";

/** The `mods { … }` block: header, body, closing brace. Anchored per line so
 *  the `maps` block (identical shape, two letters apart) can't be matched by a
 *  stray substring, and lazy in the body so it stops at its own brace. */
const MODS_BLOCK_PATTERN = /^([ \t]*mods[ \t]*\r?\n[ \t]*\{)([\s\S]*?)(\r?\n[ \t]*\})/m;

const INDENT = "    ";

const entryLines = (blockBody: string) => blockBody
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const modIdOf = (entry: string) => {
  const match = entry.match(/^mod[ \t]*=[ \t]*(.+?),?$/);
  return match ? match[1].trim() : null;
};

/** Is the mod already in this list? Falls back to scanning the whole file when
 *  the `mods` block can't be found, so an unfamiliar layout is read as "already
 *  handled" rather than silently rewritten. */
export const isModEnabled = (content: string | null, modId: string) => {
  if (!content) return false;
  const block = content.match(MODS_BLOCK_PATTERN);
  return entryLines(block ? block[2] : content).some((entry) => modIdOf(entry) === modId);
};

/** A fresh list holding just this mod. Used when the player has never opened
 *  the mod menu, so `mods\default.txt` doesn't exist yet. */
export const createModList = (modId: string, eol = "\r\n") => [
  "VERSION = 1,",
  "",
  "mods",
  "{",
  `${INDENT}mod = ${modId},`,
  "}",
  "",
  "maps",
  "{",
  "}",
  "",
].join(eol);

/**
 * The same list with `modId` appended, or `null` when nothing should be written
 * — already listed, or a shape we don't recognise. Never reorders or drops the
 * player's own mods; entries are re-indented and comma-terminated the way the
 * game writes them.
 *
 * @param content current file contents, or null when the file doesn't exist.
 */
export const withModEnabled = (content: string | null, modId: string): string | null => {
  if (content === null || content.trim() === "") return createModList(modId);
  if (isModEnabled(content, modId)) return null;

  const block = content.match(MODS_BLOCK_PATTERN);
  if (!block) return null; // hand-edited or from another version — leave it alone

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const entries = [...entryLines(block[2]), `mod = ${modId}`];
  const body = entries
    .map((entry) => `${eol}${INDENT}${entry.replace(/,+$/, "")},`)
    .join("");

  // Replacer function, not a string: `$` in a mod id must stay literal.
  return content.replace(MODS_BLOCK_PATTERN, () => `${block[1]}${body}${block[3]}`);
};
