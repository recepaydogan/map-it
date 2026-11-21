import fs from "node:fs";
import path from "node:path";

const MODULE_PRIORITY = new Map([
  ["Shared", 0],
  ["SharedDev", 1],
  ["Gustav", 2],
  ["GustavDev", 3],
]);

const unescapeValue = (value) => value
  .replaceAll('\\"', '"')
  .replaceAll("\\n", "\n")
  .replaceAll("\\\\", "\\");

const moduleName = (filePath) => [...MODULE_PRIORITY.keys()]
  .find((candidate) => filePath.includes(`${path.sep}${candidate}${path.sep}`));

const listItemCombinationFiles = (root) => {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.name === "ItemCombos.txt") files.push(absolutePath);
    }
  };
  visit(root);
  return files.sort((left, right) => (
    (MODULE_PRIORITY.get(moduleName(left)) ?? 99) - (MODULE_PRIORITY.get(moduleName(right)) ?? 99)
      || left.localeCompare(right, "en")
  ));
};

const parseFile = (filePath) => {
  const combinations = [];
  let combination = null;
  let result = null;

  const finishResult = () => {
    if (!result || !combination) return;
    combination.results.push(result);
    result = null;
  };
  const finishCombination = () => {
    finishResult();
    if (combination) combinations.push(combination);
    combination = null;
  };

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const combinationMatch = line.match(/^new ItemCombination "((?:\\"|[^"])*)"/);
    if (combinationMatch) {
      finishCombination();
      combination = {
        id: unescapeValue(combinationMatch[1]),
        data: {},
        results: [],
        provenance: filePath.replaceAll("\\", "/"),
      };
      continue;
    }

    const resultMatch = line.match(/^new ItemCombinationResult "((?:\\"|[^"])*)"/);
    if (resultMatch) {
      finishResult();
      if (!combination) continue;
      result = { id: unescapeValue(resultMatch[1]), data: {} };
      continue;
    }

    const dataMatch = line.match(/^data "((?:\\"|[^"])*)" "((?:\\"|[^"])*)"/);
    if (!dataMatch) continue;
    const target = result ?? combination;
    if (target) target.data[unescapeValue(dataMatch[1])] = unescapeValue(dataMatch[2]);
  }
  finishCombination();
  return combinations;
};

/**
 * Reads the game's ItemCombos definitions and returns their raw, ordered input
 * groups and result variants. Later game modules override earlier definitions
 * with the same identifier, matching the stats pipeline's module precedence.
 */
export const readItemCombinations = (root) => {
  const byId = new Map();
  for (const filePath of listItemCombinationFiles(root)) {
    for (const combination of parseFile(filePath)) byId.set(combination.id, combination);
  }

  return [...byId.values()].flatMap((combination) => {
    const materials = [1, 2, 3].flatMap((slot) => {
      const type = combination.data[`Type ${slot}`];
      const object = combination.data[`Object ${slot}`];
      const transform = combination.data[`Transform ${slot}`];
      if (!type || !object || !["Consume", "Transform"].includes(transform)) return [];
      return [{ type: type === "Category" ? "category" : "item", id: object }];
    });
    if (!materials.length) return [];

    return combination.results.flatMap((result) => [1, 2, 3].flatMap((slot) => {
      const statsId = result.data[`Result ${slot}`];
      if (!statsId) return [];
      return [{
        id: result.id,
        source: "item-combination",
        result: {
          statsId,
          amount: Number(result.data[`ResultAmount ${slot}`]) || 1,
        },
        materials,
        provenance: combination.provenance,
      }];
    }));
  });
};
