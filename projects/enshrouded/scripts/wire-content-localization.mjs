// One-time, idempotent migration of display expressions. Source IDs, props
// used for navigation, comparisons and event payloads are deliberately kept.
import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directories = ["src/features/knowledge", "src/features/crafting", "src/features/map"];
const files = directories.flatMap(directory => readdirSync(resolve(root, directory))
  .filter(name => name.endsWith(".tsx") && (directory !== "src/features/map" || name.startsWith("enshrouded-")))
  .map(name => resolve(root, directory, name)));
const config = ts.readConfigFile(resolve(root, "tsconfig.app.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const functionName = node => node.name?.getText()
  ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : "");
const isFunction = node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
const componentFor = node => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isFunction(parent) && /^[A-Z]/.test(functionName(parent))) return parent;
  }
};
const hasString = type => Boolean(type.flags & ts.TypeFlags.StringLike)
  || Boolean(type.isUnion?.() && type.types.some(hasString));
for (const file of files) {
  const source = program.getSourceFile(file);
  const original = readFileSync(file, "utf8");
  if (original.includes("const contentText = useGameText()")) continue;
  const edits = [];
  const components = new Set();
  let count = 0;
  const visit = node => {
    if (ts.isJsxExpression(node) && node.expression && !node.dotDotDotToken) {
      const expression = node.expression;
      const parent = node.parent;
      let eligible = !ts.isJsxAttribute(parent);
      if (ts.isJsxAttribute(parent)) {
        eligible = ["title", "aria-label", "placeholder", "alt"].includes(parent.name.getText());
      }
      const text = expression.getText(source);
      const component = componentFor(node);
      if (eligible && component && hasString(checker.getTypeAtLocation(expression))
        && !/^t\(/.test(text) && !/^contentText\(/.test(text)) {
        edits.push({ at: expression.getStart(source), text: "contentText(" }, { at: expression.end, text: ")" });
        components.add(component);
        count++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!count) continue;
  for (const component of components) {
    if (ts.isBlock(component.body)) {
      edits.push({ at: component.body.getStart(source) + 1, text: "\n  const contentText = useGameText();" });
    } else {
      edits.push({ at: component.body.getStart(source), text: "{\n  const contentText = useGameText();\n  return (" },
        { at: component.body.end, text: ");\n}" });
    }
  }
  edits.push({ at: 0, text: 'import { useGameText } from "../../i18n/game-text";\n' });
  edits.sort((a, b) => b.at - a.at);
  let result = original;
  for (const edit of edits) result = result.slice(0, edit.at) + edit.text + result.slice(edit.at);
  writeFileSync(file, result);
  console.log(`${file.slice(root.length + 1)}: ${count} display expressions`);
}
