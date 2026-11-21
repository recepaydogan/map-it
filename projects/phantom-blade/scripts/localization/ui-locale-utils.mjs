export const flatten = (value, prefix = "", output = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") output[name] = child;
    else if (child && typeof child === "object") flatten(child, name, output);
  }
  return output;
};
export const setPath = (root, key, value) => {
  const parts = key.split(".");
  let target = root;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts.at(-1)] = value;
};
export const placeholders = value => (value.match(/{{[^}]+}}/g) ?? []).sort();
export const validTranslation = (source, target) => typeof target === "string" && (source.trim() ? Boolean(target.trim()) : !target.trim())
  && JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(target));
export const canonicalText = value => value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
