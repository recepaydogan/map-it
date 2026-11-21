import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectRoot, "src", "features", "map", "map-config.ts");
const sourceText = fs.readFileSync(sourcePath, "utf8");
const source = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true);

const property = (node, name) => node.properties.find((candidate) =>
  ts.isPropertyAssignment(candidate)
  && ((ts.isIdentifier(candidate.name) && candidate.name.text === name)
    || (ts.isStringLiteral(candidate.name) && candidate.name.text === name)));
const stringProperty = (node, name) => {
  const result = property(node, name);
  assert.ok(result && ts.isStringLiteral(result.initializer), `${name} is a string literal`);
  return result.initializer.text;
};

let connectionArray;
const visit = (node) => {
  if (ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === "MAP_CONNECTIONS"
    && node.initializer
    && ts.isArrayLiteralExpression(node.initializer)) {
    connectionArray = node.initializer;
  }
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(connectionArray, "MAP_CONNECTIONS array exists");

const index = JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "maps", "index.json"), "utf8"));
const locations = new Map(index.locations.map((location) => [`${location.mapId}:${location.id}`, location]));
const connectionIds = new Set();
const connectionEndpointPairs = new Set();
const supportedConfiguredEvidence = new Set([
  "paired-extracted-teleport-name",
  "scripted-party-teleport",
]);

const normalizeTeleportName = (value) => value.toLocaleLowerCase("en-US")
  .replace(/^(?:s_|bld_|tool_)/, "")
  .replace(/^(?:wld_|scl_|moo_|wyr_|bgo_|low_|cty_|cre_|und_|hag_|tut_|end_)/, "")
  .replace(/(^|_)(?:teleport|teleporter|invisible|dynamic|trigger|point|marker)(_|$)/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_|_$/g, "");

for (const connectionNode of connectionArray.elements) {
  assert.ok(ts.isObjectLiteralExpression(connectionNode), "connection is an object literal");
  const id = stringProperty(connectionNode, "id");
  assert.equal(connectionIds.has(id), false, `duplicate connection id ${id}`);
  connectionIds.add(id);
  const evidence = stringProperty(connectionNode, "evidence");
  assert.ok(supportedConfiguredEvidence.has(evidence), `${id} uses supported evidence`);

  const endpointsProperty = property(connectionNode, "endpoints");
  assert.ok(endpointsProperty && ts.isArrayLiteralExpression(endpointsProperty.initializer), `${id} endpoints array`);
  assert.equal(endpointsProperty.initializer.elements.length, 2, `${id} has reciprocal endpoints`);
  const endpointEntities = [];
  for (const endpointNode of endpointsProperty.initializer.elements) {
    assert.ok(ts.isObjectLiteralExpression(endpointNode), `${id} endpoint is an object`);
    const mapId = stringProperty(endpointNode, "mapId");
    const locationId = stringProperty(endpointNode, "locationId");
    const location = locations.get(`${mapId}:${locationId}`);
    assert.ok(location, `${id} endpoint ${mapId}:${locationId} exists in the index`);
    assert.equal(location.category, "transition", `${id} endpoint is a passage`);
    const content = JSON.parse(fs.readFileSync(
      path.join(projectRoot, "public", "maps", mapId, "content.json"),
      "utf8",
    ));
    const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
    const entity = entities.find((candidate) => candidate.id === location.contentId);
    assert.ok(entity?.internalName, `${id} endpoint has an extracted internal name`);
    endpointEntities.push(entity);
  }
  if (evidence === "paired-extracted-teleport-name") {
    assert.equal(
      normalizeTeleportName(endpointEntities[0].internalName),
      normalizeTeleportName(endpointEntities[1].internalName),
      `${id} extracted teleport names pair exactly`,
    );
  }
  const endpointKey = endpointsProperty.initializer.elements.map((endpointNode) => {
    const mapId = stringProperty(endpointNode, "mapId");
    const locationId = stringProperty(endpointNode, "locationId");
    return `${mapId}:${locationId}`;
  }).sort().join("|");
  connectionEndpointPairs.add(endpointKey);
}

for (const connection of index.connections) {
  const endpointKey = connection.endpoints
    .map(({ mapId, locationId }) => `${mapId}:${locationId}`)
    .sort()
    .join("|");
  assert.equal(connectionEndpointPairs.has(endpointKey), false, `${connection.id} duplicates a configured passage`);
  connectionEndpointPairs.add(endpointKey);
}

// The runtime index parser rejects the whole index when a shipped connection
// carries an evidence value it does not know, so the two lists must agree.
const parserPath = path.join(projectRoot, "src", "features", "map", "use-map-search-index.ts");
const parserSource = ts.createSourceFile(
  parserPath,
  fs.readFileSync(parserPath, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
let acceptedEvidence;
const visitParser = (node) => {
  if (ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === "CONNECTION_EVIDENCE"
    && node.initializer
    && ts.isNewExpression(node.initializer)
    && node.initializer.arguments?.length === 1
    && ts.isArrayLiteralExpression(node.initializer.arguments[0])) {
    acceptedEvidence = new Set(node.initializer.arguments[0].elements
      .filter((element) => ts.isStringLiteral(element))
      .map((element) => element.text));
  }
  ts.forEachChild(node, visitParser);
};
visitParser(parserSource);
assert.ok(acceptedEvidence?.size, "the runtime parser declares CONNECTION_EVIDENCE");
for (const connection of index.connections) {
  assert.ok(
    acceptedEvidence.has(connection.evidence),
    `${connection.id} uses evidence "${connection.evidence}" the runtime index parser rejects`,
  );
}

console.log(`Map connection tests passed for ${connectionIds.size + index.connections.length} verified passages.`);
