import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act2_MOO_NecromancerRoom.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "balthazar-secret-room.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const character of body) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};
const endpoint = (argument) => ({
  objectId: argument.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US"),
  token: argument.replace(/^\([A-Z]+\)/, "").trim(),
});
const evidenceAt = (lines, index) => ({
  sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
  sourceLine: index + 1,
  statement: lines[index].trim(),
});

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
const books = [];
let correctBook = null;
let spikeTrapBook = null;
let heartAltar = null;
let secretDoor = null;
let secretResearch = null;
let activeValidPartRules = 0;
let commentedValidPartRules = 0;
let acceptsBodyPartVariable = false;
let inBlockComment = false;

for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (statement.startsWith("/*")) {
    inBlockComment = true;
    continue;
  }
  if (statement.endsWith("*/")) {
    inBlockComment = false;
    continue;
  }
  if (statement.startsWith("DB_MOO_BalthazarsSecrets_ValidPart(")) {
    if (inBlockComment) commentedValidPartRules += 1;
    else activeValidPartRules += 1;
  }
  if (inBlockComment) continue;
  if (statement.startsWith("DB_MOO_BalthazarsSecrets_TrapBooks(") && statement.match(guidPattern)) {
    const book = endpoint(splitArguments(statement)[0] ?? "");
    books.push({ book, evidence: evidenceAt(lines, index) });
  }
  if (!secretResearch && statement.startsWith("DB_BookFlags(S_MOO_BalthazarSecretBook_")) {
    secretResearch = endpoint(splitArguments(statement)[0] ?? "");
  }
  if (!correctBook && statement.startsWith("DualEntityEvent( _, S_MOO_TrapBook_") && statement.includes('"MOO_BalthazarsSecrets_ActivateHeartBox"')) {
    correctBook = endpoint(splitArguments(statement)[1] ?? "");
  }
  if (!spikeTrapBook && statement.startsWith("DualEntityEvent(_, S_MOO_TrapBook_") && statement.includes('"MOO_BalthazarsSecrets_Spikes"')) {
    spikeTrapBook = endpoint(splitArguments(statement)[1] ?? "");
  }
  if (!heartAltar && statement.startsWith("SetCanInteract(S_MOO_HeartBox_")) heartAltar = endpoint(splitArguments(statement)[0] ?? "");
  if (statement.startsWith("Combined(S_MOO_HeartBox_") && statement.includes("_BodyPart")) acceptsBodyPartVariable = true;
  if (!secretDoor && statement.startsWith("Open(S_MOO_BookcaseDoor_")) secretDoor = endpoint(splitArguments(statement)[0] ?? "");
}

const classifiedBooks = books.map((book) => ({
  ...book,
  effect: book.book.objectId === correctBook?.objectId
    ? "reveals-heart-altar"
    : book.book.objectId === spikeTrapBook?.objectId ? "spike-trap" : "decoy",
}));
if (books.length !== 4 || !correctBook?.objectId || !spikeTrapBook?.objectId || !heartAltar?.objectId
  || !secretDoor?.objectId || !secretResearch?.objectId || !acceptsBodyPartVariable
  || activeValidPartRules !== 0 || commentedValidPartRules !== 12) {
  throw new Error("Incomplete Balthazar secret-room extraction.");
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    bookshelfLevers: books.length,
    safeBooks: 1,
    explicitSpikeTraps: 1,
    activeBodyPartRestrictions: activeValidPartRules,
    disabledBodyPartRestrictionRules: commentedValidPartRules,
  },
  id: "balthazar-secret-room",
  title: "Balthazar's Secret Room",
  books: classifiedBooks,
  heartAltar,
  acceptsAnyBodyPart: true,
  secretDoor,
  secretResearch,
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Balthazar secret room: ${catalog.stats.bookshelfLevers} books, exact safe lever, unrestricted body-part altar, and hidden research cataloged.`);
