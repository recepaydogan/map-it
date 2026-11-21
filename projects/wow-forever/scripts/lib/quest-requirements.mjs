const classKeys = { 1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest", 7: "shaman", 8: "mage", 9: "warlock", 11: "druid" };
const professionKey = (name) => name.trim().toLowerCase().replaceAll(" ", "-");

/** Only explicit Forever class links, profession facts and skill objectives qualify. */
export function buildQuestRequirements(evidence) {
  const quests = {};
  const getQuest = (id, title) => quests[id] ??= { title };
  const groups = new Map();
  for (const page of evidence.lists) {
    const match = page.range?.match(/^(\d+) - (\d+) of (\d+)$/);
    if (!match || page.rows.length !== Number(match[2]) - Number(match[1]) + 1) {
      throw new Error(`Incomplete list page: ${page.url} ${page.range}`);
    }
    const url = new URL(page.url);
    url.hash = "";
    const group = groups.get(url.href) ?? { expected: Number(match[3]), rows: new Map() };
    if (group.expected !== Number(match[3])) throw new Error("List total changed during capture");
    for (const row of page.rows) group.rows.set(row.id, row);
    groups.set(url.href, group);
    if (!url.searchParams.has("filter-any")) continue;
    for (const row of page.rows) {
      if (!row.classes.length) throw new Error(`Class filter returned no class: ${row.id}`);
      const classes = row.classes.map((entry) => {
        const key = classKeys[entry.id];
        if (!key) throw new Error(`Unrecognized class: ${entry.id}`);
        return { id: entry.id, key, name: entry.name.trim() };
      }).sort((a, b) => Number(a.id) - Number(b.id));
      const quest = getQuest(row.id, row.title);
      if (quest.classes && JSON.stringify(quest.classes) !== JSON.stringify(classes)) {
        throw new Error(`Conflicting class lists: ${row.id}`);
      }
      quest.classes = classes;
    }
  }
  for (const [url, group] of groups) {
    if (group.rows.size !== group.expected) throw new Error(`Incomplete list: ${url} (${group.rows.size}/${group.expected})`);
  }
  const details = new Map();
  for (const detail of evidence.details) {
    const id = detail.url.match(/^https:\/\/www\.wowhead\.com\/forever\/quest=(\d+)\//)?.[1];
    if (!id || !detail.title || !detail.facts.length) throw new Error(`Invalid detail identity: ${detail.url}`);
    details.set(id, detail);
    const professionFact = detail.facts.find((fact) => /^Profession:/.test(fact.text));
    const skill = detail.body?.match(/Raise your ([a-z ]+) skill to (\d+)/i);
    const learnCooking = detail.title === "Camping 101: Cooking" && /\bLearn cooking from\b/i.test(detail.body ?? "");
    const races = detail.facts.filter((fact) => /^Races?:/.test(fact.text))
      .flatMap((fact) => fact.links.filter((link) => /\/race=\d+\//.test(link.url))
        .map((link) => ({ id: link.url.match(/race=(\d+)/)[1], name: link.text.trim() })));
    if (!professionFact && !skill && !learnCooking && !races.length) continue;
    const quest = getQuest(id, detail.title);
    if (professionFact) {
      const link = professionFact.links.find((entry) => /\/skill=\d+\//.test(entry.url));
      if (!link) throw new Error(`Profession fact missing skill identity: ${id}`);
      quest.profession = { id: link.url.match(/skill=(\d+)/)[1], key: professionKey(link.text), name: link.text.trim() };
    }
    if (skill) {
      const key = professionKey(skill[1]);
      // A completion objective is never an inferred acceptance-level requirement.
      if (detail.title !== `Camping 101: ${skill[1].replace(/\b\w/g, (letter) => letter.toUpperCase())}`) {
        throw new Error(`Review skill objective context before import: ${id}`);
      }
      quest.profession ??= { key, name: detail.title.slice("Camping 101: ".length) };
      if (quest.profession.key !== key) throw new Error(`Profession/objective conflict: ${id}`);
      quest.skillObjective = { professionKey: key, level: Number(skill[2]) };
    }
    if (races.length) quest.races = races;
    if (learnCooking) quest.learnProfession = { key: "cooking", name: "Cooking" };
  }
  const professionRows = [...groups.values()].flatMap((group) => [...group.rows.values()])
    .filter((row) => row.categoryUrl?.includes("/quests=5."));
  for (const row of professionRows) {
    if (!details.has(row.id) || !quests[row.id]?.profession) throw new Error(`Unverified profession detail: ${row.id}`);
  }
  return { version: 1, verifiedAt: evidence.capturedAt, quests };
}

/** Keep Classic associations separate from profession facts verified in Forever. */
export function addClassicProfessionReferences(data, review, candidates, details) {
  const unresolved = new Map(candidates.filter((candidate) => details.has(candidate.id) && !data.quests[candidate.id]?.profession)
    .map((candidate) => [candidate.id, candidate]));
  if (review.records.length !== unresolved.size) throw new Error("Classic review does not cover every unresolved candidate");
  const seen = new Set();
  for (const record of review.records) {
    if (seen.has(record.id)) throw new Error(`Duplicate Classic reference: ${record.id}`);
    seen.add(record.id);
    const candidate = unresolved.get(record.id);
    const detail = details.get(record.id);
    const legacy = candidate?.legacyProfession?.[0]?.match(/^([A-Za-z ]+) \((\d+)\)$/);
    if (!candidate || !detail || candidate.title !== record.title || detail.title !== record.title ||
      candidate.legacyProfession.length !== 1 || !legacy || legacy[1] !== record.profession ||
      !record.basis?.trim()) throw new Error(`Invalid Classic reference: ${record.id}`);
    const quest = data.quests[record.id] ??= { title: record.title };
    quest.classicProfessionReference = { key: professionKey(record.profession), name: record.profession };
  }
  return data;
}
