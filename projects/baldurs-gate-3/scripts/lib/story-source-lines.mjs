// Remove comments without changing physical line numbers or quoted content.
// Region annotations are retained separately and only from real line comments.
export const readStorySourceLines = (source) => {
  let block = false, quoted = false, escaped = false;
  const comments = [];
  const lines = source.split(/\r?\n/).map((line, row) => {
    let code = "";
    for (let index = 0; index < line.length; index++) {
      const character = line[index], next = line[index + 1];
      if (block) {
        if (character === "*" && next === "/") { block = false; code += "  "; index++; }
        else code += " ";
      } else if (quoted) {
        code += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') { code += character; quoted = true; }
      else if (character === "/" && next === "*") { block = true; code += "  "; index++; }
      else if (character === "/" && next === "/") {
        if (!code.trim()) comments[row] = line.slice(index);
        code += " ".repeat(line.length - index);
        break;
      } else code += character;
    }
    if (escaped) escaped = false;
    return code;
  });
  if (block || quoted) throw new Error("Unterminated comment or string in story source");
  return { lines, comments };
};

export const normalizeStoryCode = (text) => text.trim().replace(/"(?:\\[\s\S]|[^"\\])*"|\s+/g,
  (token) => token.startsWith('"') ? token : " ");

// Parentheses inside dialogue strings are text, not statement delimiters.
export const storyStatementSpan = (text) => {
  let depth = 0, quoted = false, escaped = false, closingIndex = -1;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "(") depth++;
    else if (character === ")") {
      depth--; closingIndex = index;
      if (depth === 0) break;
    }
  }
  return { depth, closingIndex, quoted };
};
