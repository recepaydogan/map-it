import { parse } from "acorn";
import { readFileSync } from "node:fs";

function walk(node, visit, functions = [], parent) {
  if (!node || typeof node !== "object") return;
  const nested = /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type) ? [...functions, node] : functions;
  visit(node, nested, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["start", "end", "type"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, nested, node));
    else if (value && typeof value === "object") walk(value, visit, nested, node);
  }
}

const subscriptionUiMarkers = new Set(["subscription-settings-title", "premiumPlans.title", "ads.goPremium"]);
const subscriptionActions = new Set(["onOpenPackages", "onRemoveAds"]);
const hideSoloSubscriptionUi = "globalThis.__MAP_IT_APP__?.showSoloSubscriptionUi !== true";

function collectSubscriptionUiEdits(tree, text) {
  const componentBodies = new Set();
  const edits = [];
  const gate = (node, hiddenValue) => ({
    start: node.start,
    end: node.end,
    text: `(${hideSoloSubscriptionUi} ? ${hiddenValue} : (${text.slice(node.start, node.end)}))`,
  });

  walk(tree, (node, functions, parent) => {
    if (node.type === "Literal" && subscriptionUiMarkers.has(node.value)) {
      const body = functions.at(-1)?.body;
      if (body?.type === "BlockStatement") componentBodies.add(body);
    }
    if (node.type === "Property" && parent?.type === "ObjectExpression"
      && subscriptionActions.has(node.key.name ?? node.key.value)) {
      const edit = gate(node.value, "undefined");
      if (node.shorthand) edit.text = `${node.key.name}: ${edit.text}`;
      edits.push(edit);
    }
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression"
      && node.callee.property.name === "get" && node.arguments[0]?.type === "Literal") {
      const key = node.arguments[0].value;
      if (key === "previewPremium" || (key === "preview" && parent?.type === "BinaryExpression"
        && (parent.left.value === "remove-ads" || parent.right.value === "remove-ads"))) {
        edits.push(gate(node, "null"));
      }
    }
    const value = node.type === "VariableDeclarator" ? node.init : null;
    if (value?.type === "LogicalExpression" && value.operator === "&&"
      && value.right.type === "MemberExpression" && value.right.property.name === "premium") {
      // Limit presentation benefits driven by a solo entitlement to its solo app.
      edits.push(gate(value, "false"));
    }
  });

  for (const body of componentBodies) {
    edits.push({ start: body.start + 1, end: body.start + 1, text: `if(${hideSoloSubscriptionUi})return null;` });
  }
  return edits;
}

export function rewriteModuleAccounts(relative, body) {
  if (!relative.startsWith("apps/")) return body;
  let text = body.toString("utf8");
  if (relative.endsWith(".html")) {
    text = text.replace(/window\.__MAP_IT_APP__=(.*?);<\/script>/s, (_bootstrap, json) => {
      const app = JSON.parse(json);
      const host = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
      for (const [name, slot] of Object.entries(app.hotkeys || {})) {
        const embedded = app.manifest.data.hotkeys?.[name];
        const binding = host.data.hotkeys[slot]?.default;
        if (embedded && binding) embedded.default = binding;
      }
      return "window.__MAP_IT_APP__=" + JSON.stringify(app).replaceAll("<", "\\u003c") + ";</script>";
    });
    return Buffer.from(text.replace('<script src="/map-it-runtime.js"></script>', '<script src="/map-it-account.js"></script><script src="/map-it-hotkeys.js"></script><script src="/map-it-runtime.js"></script>'));
  }
  const hasSubscriptionUi = /subscription-settings-title|premiumPlans\.title|ads\.goPremium/.test(text);
  if (!relative.endsWith(".js") || (!hasSubscriptionUi && !/storageKey:|\.auth\.signOut\(|https:\/\/[\w-]+\.supabase\.|["'](?:account|support)["']|Unable to sign out safely/.test(text))) return body;
  const origins = [...new Set(text.match(/https:\/\/[\w-]+\.supabase\.(?:co|in)/g) || [])];
  const tree = parse(text, { ecmaVersion: "latest", sourceType: "module" });
  const edits = hasSubscriptionUi ? collectSubscriptionUiEdits(tree, text) : [];
  const signOutBodies = new Set();
  walk(tree, (node, functions) => {
    // Minecraft's guarded flush lives in its profile handler rather than its
    // auth service. Keep that guard when the shared page replaces the profile.
    if (node.type === "Literal" && typeof node.value === "string" && node.value.includes("Unable to sign out safely") && functions.length) signOutBodies.add(functions.at(-1).body);
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.arguments.length === 1 && node.arguments[0].type === "Literal" && ["account", "support"].includes(node.arguments[0].value)) {
      edits.push({ start: node.start, end: node.end, text: node.arguments[0].value === "account" ? "window.__MAP_IT_OPEN_ACCOUNT__()" : "window.__MAP_IT_OPEN_SUPPORT__()" });
    }
    if (node.type === "Property" && node.key.name === "storageKey") {
      const value = text.slice(node.value.start, node.value.end);
      if ((node.value.type === "Literal" && typeof node.value.value === "string" && /auth$/.test(node.value.value)) || (node.value.type === "TemplateLiteral" && /-auth`$/.test(value))) edits.push({ start: node.value.start, end: node.value.end, text: '"map-it-auth"' });
    }
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "signOut" && node.callee.object.type === "MemberExpression" && node.callee.object.property.name === "auth") {
      if (functions.length) signOutBodies.add(functions.at(-1).body);
    }
  });
  const flush = new Set();
  for (const body of signOutBodies) walk(body, node => {
    if (node.type === "AwaitExpression" && node.argument.type === "CallExpression" && node.argument.callee.type === "Identifier" && node.argument.arguments.length === 1) flush.add(node.argument.callee.name);
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  if (origins.length) text = `globalThis.__MAP_IT_SOLO_ACCOUNT_ORIGINS__??=[];globalThis.__MAP_IT_SOLO_ACCOUNT_ORIGINS__.push(...${JSON.stringify(origins)});\n` + text;
  if (flush.size) text += `\n;globalThis.__MAP_IT_FLUSH_ACCOUNT__=async userId=>{try{return (await Promise.all([${[...flush].map(name => `${name}(userId)`).join(",")}])).every(value=>value!==false)}catch{return false}};\n`;
  return Buffer.from(text);
}
