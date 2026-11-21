/** Build the calculator from the same current client snapshot as class guides. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const classes = await readJson("public/data/spells/foreverdb/classes.json");
const build = await readJson("public/data/classes/guides/game-build.json");
if (!Array.isArray(classes) || classes.length !== 9 || !/^1\.60\.1\.\d+$/.test(build.version)) {
  throw new Error("Current ForeverDB class data or source build is missing.");
}
if (build.version === "1.60.1.70205") {
  const talentNames = (name) => new Set(classes.find((cls) => cls.n === name)?.trees
    ?.flatMap((tree) => tree.talents.map((talent) => talent.n)));
  const mage = talentNames("Mage");
  const druid = talentNames("Druid");
  const warrior = talentNames("Warrior");
  if (!mage.has("Heating Up") || mage.has("Hot Streak")
    || !druid.has("Shifting Power") || druid.has("King of the Jungle")
    || !warrior.has("Furious Precision") || warrior.has("Precision")) {
    throw new Error("ForeverDB talent trees do not match beta build 1.60.1.70205.");
  }
}

const shardCache = new Map();
async function spellFor(id) {
  const shardId = id % 64;
  if (!shardCache.has(shardId)) {
    shardCache.set(shardId, await readJson(`public/data/spells/foreverdb/${shardId}.json`));
  }
  return shardCache.get(shardId)[id];
}

const published = [];
for (const cls of classes) {
  if (!cls.n || cls.trees?.length !== 3) throw new Error(`Incomplete class ${cls.n}.`);
  const trees = [];
  for (const tree of cls.trees) {
    const ids = new Map(tree.talents.map((talent) => [talent.id, talent]));
    const slots = new Set();
    const talents = [];
    for (const talent of tree.talents) {
      const slot = `${talent.row}:${talent.col}`;
      if (slots.has(slot) || talent.row < 0 || talent.row > 6 || talent.col < 0 || talent.col > 3
        || !Number.isInteger(talent.max) || talent.max < 1 || talent.d?.length !== talent.max
        || talent.d.some((description) => !description)) {
        throw new Error(`Invalid ${cls.n}/${tree.n} talent ${talent.n}.`);
      }
      slots.add(slot);
      const prerequisites = (talent.pre ?? []).map(([id, rank]) => {
        if (!ids.has(id) || rank < 1 || rank > ids.get(id).max) {
          throw new Error(`Invalid prerequisite for ${cls.n}/${talent.n}.`);
        }
        return [id, rank - 1];
      });
      const spell = await spellFor(talent.sp);
      if (!spell || spell.id !== talent.sp) throw new Error(`Missing spell for ${cls.n}/${talent.n}.`);
      talents.push({
        id: talent.id, row: talent.row, col: talent.col, n: talent.n, ic: talent.ic,
        ranks: Array.from({ length: talent.max }, (_, index) => index + 1),
        d: talent.d, pre: prerequisites, passive: spell.pa === 1,
      });
    }
    trees.push({ n: tree.n, ic: tree.ic, talents });
  }
  published.push({ n: cls.n, trees });
}

await writeFile(join(root, "public/data/classes/talent-calculator.json"),
  `${JSON.stringify({ version: 1,
    sourceBuild: build.version, classes: published })}\n`);
console.log(`Published ${published.length} class talent trees from ForeverDB build ${build.version}.`);
