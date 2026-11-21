/** Remove Wowhead page controls that follow the actual quest prose section. */
export function stripWowheadQuestChrome(body) {
  const lines = body.split("\n");
  const end = lines.findIndex((line) =>
    /^\s*\|/.test(line) ||
    /^\s*See if you've already completed this by typing:\s*$/i.test(line) ||
    /^\s*Wenn du Folgendes im Spiel eingibst,/i.test(line) ||
    /^\s*Comprueba si ya lo has completad escribiendo:/i.test(line) ||
    /^\s*Vérifiez si vous l'avez déjà terminé en tapant\s*:/i.test(line) ||
    /^\s*이미 완료했는지 확인하려면/.test(line) ||
    /^\s*Veja se já completou isto escrevendo:/i.test(line) ||
    /^\s*输入以下代码查看此任务是否已完成/.test(line) ||
    /^\s*輸入以下代碼查看此任務是否已完成/.test(line) ||
    /^\s*Gather info with the Wowhead Client\s*$/i.test(line) ||
    /^\s*\/run print\(C_QuestLog\.IsQuestFlaggedCompleted\(/.test(line));
  return lines.slice(0, end < 0 ? undefined : end).join("\n");
}

/** The one-line objective immediately below the localized quest title. */
export function extractWowheadQuestObjective(page) {
  return /^# [^\n]+\n+([^\n|]+)$/m.exec(page)?.[1];
}

/** Wowhead wraps an untranslated locale section in brackets on some quests. */
export function isEnglishQuestProseFallback(localized, english) {
  if (typeof localized !== "string" || typeof english !== "string") return false;
  const comparable = (value) => value.replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[’]/g, "'").replace(/\s+/g, "").trim();
  const candidate = localized.trim();
  const bracketed = candidate.startsWith("[") && candidate.endsWith("]");
  const unwrapped = bracketed ?
    candidate.slice(1, -1) : candidate;
  if (comparable(unwrapped) === comparable(english)) return true;
  // Untranslated Wowhead prose may localize <name> while leaving every word English.
  const normalizeVariables = (value) => comparable(value).replace(/<[^<>]+>/g, "<*>");
  return bracketed && normalizeVariables(unwrapped) === normalizeVariables(english);
}
