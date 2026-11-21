export function classSpellIds(metadata) {
  const result = new Map();
  for (const ability of metadata.abilities) {
    if (ability.ranks[0]) result.set(ability.n, ability.ranks[0].id);
  }
  for (const tree of metadata.trees) for (const talent of tree.talents) {
    if (talent.ranks[0]) result.set(talent.n, talent.ranks[0]);
  }
  return result;
}

export function resolveClassGuideSpells(text, original, spellIds, source, pack, otherClasses = new Map()) {
  const explicit = text.replace(/\{\{CLIENT:SpellName:([1-9]\d*):0\|([^}]+)\}\}/g, (_, rawId, name) => {
    const id = Number(rawId);
    const index = source.keys.indexOf("SpellName:" + rawId + ":0");
    const label = pack.values[index];
    if (!Number.isSafeInteger(id) || !original.includes(name) || index < 0 || source.values[index] !== name ||
      typeof label !== "string" || !label.trim() || /[\]\r\n]/.test(label)) {
      throw new Error("Unverified explicit client spell: " + name);
    }
    return "[[spell:" + id + "|" + label + "]]";
  });
  return explicit.replace(/\{\{SPELL(?:@([a-z]+))?:([^}|]+)(?:\|([^}]+))?\}\}/g, (_, classId, name, alias) => {
    const id = (classId ? otherClasses.get(classId) : spellIds)?.get(name);
    const index = source.keys.indexOf("SpellName:" + id + ":0");
    const localized = pack.values[index];
    const approvedAlias = (name === "Sunder Armor" && alias === "Sunder") ||
      (name === "Battle Stance" && alias === "Battle" && original.includes("Battle or Berserker Stance")) ||
      (name === "Blessing of Might" && alias === "Might" && original.includes("another Paladin covers Might")) ||
      (name === "Seal of Righteousness" && alias === "Righteousness" && original.includes("Seal of Command or Righteousness")) ||
      (name === "Seal of Command" && alias === "Command" && original.includes("leave a Command Echo")) ||
      (["Command", "Righteousness", "Fury", "Justice"].includes(alias) && name === "Seal of " + alias &&
        original.includes("replacing Command, Righteousness, Fury or Justice leaves an Echo")) ||
      (["Wisdom", "Might"].includes(alias) && name === "Blessing of " + alias &&
        original.includes("Wisdom for casters, Might for melee")) ||
      (name === "Blessing of Might" && alias === "Might" && original.includes("replace Blessing of Wisdom or Might")) ||
      (name === "Prayer of Healing" && alias === "Prayers of Healing" && original.includes("between Prayers of Healing")) ||
      (name === "Curse of Weakness" && alias === "Weakness" && original.includes("Curse of Recklessness/Weakness")) ||
      (name === "Life Tap" && alias === "Tap" &&
        (original.startsWith("Tap between pulls") || original.includes("Tap between pulls when you can"))) ||
      (classId === "druid" && name === "Bear Form" && alias === "Bear" && original.includes("Bear or Cat Form"));
    if ((alias && !approvedAlias) ||
      !original.includes(alias ?? name) || !id || index < 0 || source.values[index] !== name ||
      typeof localized !== "string" || !localized || /[\]\r\n]/.test(localized)) {
      throw new Error("Unverified class spell: " + name);
    }
    return "[[spell:" + id + "|" + localized + "]]";
  });
}

export function resolveGuideItemNames(text, original, source, pack) {
  return text.replace(/\{\{ITEM:([1-9]\d*)\|([^}|]+)\}\}/g, (_, id, name) => {
    const index = source.keys.indexOf("ItemSparse:" + id + ":4");
    const label = pack.values[index];
    if (!Number.isSafeInteger(Number(id)) || !original.includes(name) || index < 0 ||
      source.values[index] !== name || typeof label !== "string" || !label.trim()) {
      throw new Error("Unverified guide item: " + name);
    }
    return label;
  });
}

export function resolveGuideClassNames(text, original, source, pack) {
  return text.replace(/\{\{CLASS:([^}]+)\}\}/g, (_, name) => {
    const matches = source.keys.flatMap((key, index) =>
      /^ChrClasses:\d+:0$/.test(key) && source.values[index] === name ? [index] : []);
    const label = pack.values[matches[0]];
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentioned = new RegExp("(?:^|[^a-z])" + escapedName + "s?(?=$|[^a-z])", "i").test(original);
    if (!mentioned || matches.length !== 1 || typeof label !== "string" || !label.trim()) {
      throw new Error("Unverified guide class: " + name);
    }
    return label;
  });
}

export function resolveGuideMapNames(text, original, source, pack) {
  return text.replace(/\{\{MAP:(\d+)\|([^}]+)\}\}/g, (_, id, name) => {
    const index = source.keys.indexOf("Map:" + id + ":1");
    const label = pack.values[index];
    if (!original.includes(name) || index < 0 || source.values[index] !== name ||
      typeof label !== "string" || !label.trim()) throw new Error("Unverified guide map: " + name);
    return label;
  });
}

export function resolveGuideRaceNames(text, original, source, pack) {
  return text.replace(/\{\{RACE:(?:([1-9]\d*)\|)?([^}|]+)\}\}/g, (_, id, name) => {
    const matches = source.keys.flatMap((key, index) =>
      (id ? key === "ChrRaces:" + id + ":2" : /^ChrRaces:\d+:2$/.test(key)) && source.values[index] === name ? [index] : []);
    const label = pack.values[matches[0]];
    if (!original.includes(name) || matches.length !== 1 || typeof label !== "string" || !label.trim()) {
      throw new Error("Unverified guide race: " + name);
    }
    return label;
  });
}

// Korean particles depend on the final sound of the localized game name.
// Restrict this to complete particles after explicit terms, never ordinary prose.
export function resolveKoreanGuideParticles(text, resolveTerm) {
  return text.replace(/(\{\{[^{}]+\}\}|\[\[spell:\d+\|[^\]]+\]\])(으로|로|은|는|이|가|을|를|과|와)(?=[\s.,!?;:])/g, (_, token, particle) => {
    const resolved = resolveTerm(token).replace(/\[\[spell:\d+\|([^\]]+)\]\]/g, "$1");
    const code = resolved.trim().at(-1)?.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3 || code === undefined) return token + particle;
    const final = (code - 0xac00) % 28;
    const pair = [["은", "는"], ["이", "가"], ["을", "를"], ["과", "와"], ["으로", "로"]]
      .find(pair => pair.includes(particle));
    return token + pair[final && !(pair[0] === "으로" && final === 8) ? 0 : 1];
  });
}
