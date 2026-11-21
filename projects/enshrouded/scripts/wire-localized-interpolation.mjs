// Localize display parameters passed to i18next without changing source IDs.
import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fields = new Set(["name", "label", "names", "region", "item", "category"]);
for (const directory of ["knowledge", "crafting", "map"]) {
  const base = resolve(root, "src/features", directory);
  for (const name of readdirSync(base).filter(name => name.endsWith(".tsx") && (directory !== "map" || name.startsWith("enshrouded-")))) {
    const file = resolve(base, name);
    const text = readFileSync(file, "utf8");
    if (!text.includes("const contentText = useGameText()")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t"
        && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        for (const property of node.arguments[1].properties) {
          if (!ts.isPropertyAssignment(property) || !fields.has(property.name.getText(source))) continue;
          const value = property.initializer;
          if (/^(?:contentText|t)\(/.test(value.getText(source))) continue;
          edits.push({ at: value.getStart(source), text: "contentText(" }, { at: value.end, text: ")" });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    let result = text;
    for (const edit of edits.sort((a, b) => b.at - a.at)) result = result.slice(0, edit.at) + edit.text + result.slice(edit.at);
    if (edits.length) {
      writeFileSync(file, result);
      console.log(`${directory}/${name}: ${edits.length / 2} localized display parameters`);
    }
  }
}
