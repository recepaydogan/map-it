const getTileBlock = (lines, startIndex) => {
  let depth = 0;
  const block = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    block.push(line);
    depth += (line.match(/{/g) ?? []).length;
    depth -= (line.match(/}/g) ?? []).length;
    if (depth === 0 && block.some((candidate) => candidate.includes("{"))) {
      return { block: block.join("\n"), endIndex: index };
    }
  }
  return { block: block.join("\n"), endIndex: lines.length - 1 };
};

/** Parse the property table attached to every named tile. Later sources are
 * patches: merge their properties over the base definition instead of
 * replacing the entire tile. */
export const parseTileDefinitions = (sources) => {
  const definitions = new Map();

  for (const source of sources) {
    const lines = source.split(/\r?\n/);
    let pendingTileName;
    for (let index = 0; index < lines.length; index += 1) {
      const commentMatch = lines[index].match(/^\s*\/\/\s+([^\s]+)\s*$/);
      if (commentMatch) {
        pendingTileName = commentMatch[1];
        continue;
      }
      if (!pendingTileName || !/^\s*tile\s*$/.test(lines[index])) continue;

      let openingIndex = index + 1;
      while (openingIndex < lines.length && !lines[openingIndex].includes("{")) openingIndex += 1;
      if (openingIndex >= lines.length) break;
      const { block, endIndex } = getTileBlock(lines, openingIndex);
      const properties = { ...(definitions.get(pendingTileName) ?? {}) };
      for (const line of block.split("\n")) {
        const propertyMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (propertyMatch) properties[propertyMatch[1]] = propertyMatch[2];
      }
      definitions.set(pendingTileName, properties);
      pendingTileName = undefined;
      index = endIndex;
    }
  }

  return definitions;
};

export const parseTileContainerTypes = (sources) => {
  return getTileContainerTypes(parseTileDefinitions(sources));
};

export const getTileContainerTypes = (definitions) => {
  const containerTypes = new Map();
  for (const [tileName, properties] of definitions) {
    if (properties.container) containerTypes.set(tileName, properties.container.toLowerCase());
  }
  return containerTypes;
};
