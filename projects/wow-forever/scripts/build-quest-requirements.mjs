/** Build reusable requirements without publishing source names or research URLs. */
import { readFile, writeFile } from "node:fs/promises";
import { addClassicProfessionReferences, buildQuestRequirements } from "./lib/quest-requirements.mjs";

const root = "data/site-research/quest-requirements-2026-10-22";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const [evidence, catalog, map, candidates, classicReview] = await Promise.all([
  read(`${root}/browser-evidence.json`), read("public/data/quests/quest-details.json"),
  read("public/maps/world-atlas/locations-forever-all-quests.json"), read(`${root}/legacy-candidates.json`),
  read(`${root}/classic-reference-review.json`),
]);
const details = new Map(evidence.details.map((detail) => [detail.url.match(/quest=(\d+)/)[1], detail]));
const data = addClassicProfessionReferences(buildQuestRequirements(evidence), classicReview, candidates, details);
const mapIds = new Set(map.locations.map((point) => point.questId));
const rows = Object.entries(data.quests);
const matched = rows.filter(([id]) => mapIds.has(id));
const report = {
  verifiedAt: data.verifiedAt,
  classicCheckedAt: classicReview.checkedAt,
  listPages: evidence.lists.length,
  detailPages: details.size,
  total: { classes: rows.filter(([, q]) => q.classes?.length).length,
    professions: rows.filter(([, q]) => q.profession).length,
    classicProfessionReferences: rows.filter(([, q]) => q.classicProfessionReference).length,
    skillObjectives: rows.filter(([, q]) => q.skillObjective).length,
    professionLearningObjectives: rows.filter(([, q]) => q.learnProfession).length,
    races: rows.filter(([, q]) => q.races?.length).length },
  currentMap: { quests: mapIds.size, classes: matched.filter(([, q]) => q.classes?.length).length,
    professions: matched.filter(([, q]) => q.profession).length,
    classicProfessionReferences: matched.filter(([, q]) => q.classicProfessionReference).length,
    skillObjectives: matched.filter(([, q]) => q.skillObjective).length,
    professionLearningObjectives: matched.filter(([, q]) => q.learnProfession).length,
    races: matched.filter(([, q]) => q.races?.length).length },
  pendingDetails: candidates.filter((quest) => !details.has(quest.id)),
  professionReview: candidates.filter((quest) => details.has(quest.id) && !data.quests[quest.id]?.profession),
  titleDifferences: rows.filter(([id, q]) => catalog.quests[id] && catalog.quests[id].title !== q.title)
    .map(([id, q]) => ({ id, existing: catalog.quests[id].title, observed: q.title })),
  complete: false,
  coverage: {
    classListsComplete: true,
    professionCategoryDetailsComplete: true,
    campingNamedDetailsComplete: evidence.lists.filter((page) => page.url.includes("name:Camping"))
      .every((page) => page.rows.every((row) => details.has(row.id))),
    legacyProfessionCandidatesReviewed: candidates.every((quest) => details.has(quest.id)),
  },
  limitations: [
    "Unlisted records are unknown, not confirmed unrestricted.",
    "A skill completion objective is not a minimum skill for accepting a quest.",
    "Profession facts identify the profession; skill ranks and specializations need separate evidence.",
    "Legacy profession hints never become verified requirements by title matching alone.",
    "Classic profession references are advisory until Forever requirements are confirmed; legacy skill ranks are not published.",
  ],
};
await writeFile("public/data/quests/requirements.json", `${JSON.stringify(data, null, 2)}\n`);
await writeFile(`${root}/review.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ total: report.total, currentMap: report.currentMap,
  pendingDetails: report.pendingDetails.length, professionReview: report.professionReview.length,
  titleDifferences: report.titleDifferences.length }));
