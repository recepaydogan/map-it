import fs from "node:fs";

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

export const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\r/g, "")
  .trim();

// Reads a game localization XML into a handle -> plain-text map.
export const readLocalization = (filePath) => {
  const values = new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  for (const match of xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)) {
    const value = stripLocalizationMarkup(match[2]);
    if (value) values.set(match[1], value);
  }
  return values;
};
