import { parseRegionSnapshotName, REGION_SNAPSHOT_BYTE_LIMIT, REGION_SNAPSHOT_FILE_LIMIT,
  REGION_SNAPSHOT_TOTAL_BYTE_LIMIT } from "./region-snapshot-plan.ts";

export interface RegionFolderFile {
  name: string;
  size: number;
  webkitRelativePath: string;
}

export interface RegionFolderSelection<T extends RegionFolderFile> {
  files: readonly T[];
  matchedFiles: number;
  folderLabel: string;
}

const suffixMatches = (path: readonly string[], suffix: readonly string[]) => suffix.length <= path.length &&
  suffix.every((segment, index) => segment.toLocaleLowerCase("en-US") === path[path.length - suffix.length + index].toLocaleLowerCase("en-US"));

/** Select a bounded nearest subset from a directory chosen through the browser picker. */
export const selectRegionFolderFiles = <T extends RegionFolderFile>(files: readonly T[], directorySegments: readonly string[],
  focus: { x: number; z: number }, maxFiles = REGION_SNAPSHOT_FILE_LIMIT,
  maxBytes = REGION_SNAPSHOT_TOTAL_BYTE_LIMIT, excludedDirectorySegments: readonly (readonly string[])[] = []): RegionFolderSelection<T> => {
  if (!Array.isArray(files) || !files.length || !directorySegments.length || directorySegments.some(segment => !segment || segment.includes("/")) ||
    ![focus.x, focus.z].every(Number.isFinite) || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > REGION_SNAPSHOT_FILE_LIMIT ||
    !Number.isSafeInteger(maxBytes) || maxBytes < 8192 || maxBytes > REGION_SNAPSHOT_TOTAL_BYTE_LIMIT ||
    excludedDirectorySegments.some(suffix => !suffix.length || suffix.some(segment => !segment || segment.includes("/"))))
    throw new Error("Invalid region folder selection request.");
  const candidates = files.flatMap(file => {
    if (!file || typeof file.name !== "string" || typeof file.webkitRelativePath !== "string" || !Number.isSafeInteger(file.size)) return [];
    const segments = file.webkitRelativePath.split("/").filter(Boolean);
    const filename = segments.at(-1);
    const region = filename === file.name ? parseRegionSnapshotName(filename) : null;
    const parent = segments.slice(0, -1);
    if (!region || !suffixMatches(parent, directorySegments) || excludedDirectorySegments.some(suffix => suffixMatches(parent, suffix))) return [];
    return [{ file, region, segments }];
  });
  if (!candidates.length) throw new Error("The selected folder contains no region files for the active dimension.");
  const worldRoots = new Set(candidates.map(candidate => candidate.segments.slice(0, -1 - directorySegments.length).join("/").toLocaleLowerCase("en-US")));
  if (worldRoots.size !== 1) throw new Error("The selected folder contains region files from more than one world root.");
  const identities = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.region.regionX},${candidate.region.regionZ}`;
    if (identities.has(key)) throw new Error("The selected folder contains ambiguous duplicate region coordinates.");
    identities.add(key);
  }
  const distance = (candidate: typeof candidates[number]) => Math.hypot(candidate.region.regionX * 512 + 256 - focus.x,
    candidate.region.regionZ * 512 + 256 - focus.z);
  candidates.sort((left, right) => {
    const leftContains = Math.floor(focus.x / 512) === left.region.regionX && Math.floor(focus.z / 512) === left.region.regionZ;
    const rightContains = Math.floor(focus.x / 512) === right.region.regionX && Math.floor(focus.z / 512) === right.region.regionZ;
    if (leftContains !== rightContains) return leftContains ? -1 : 1;
    const leftDistance = distance(left), rightDistance = distance(right);
    return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 :
      left.region.regionX - right.region.regionX || left.region.regionZ - right.region.regionZ;
  });
  const selected: T[] = [];
  let bytes = 0;
  for (const candidate of candidates) {
    if (selected.length >= maxFiles) break;
    if (candidate.file.size < 8192 || candidate.file.size > REGION_SNAPSHOT_BYTE_LIMIT || bytes + candidate.file.size > maxBytes) continue;
    selected.push(candidate.file); bytes += candidate.file.size;
  }
  if (!selected.length) throw new Error("No region file fits the configured snapshot limits.");
  const root = candidates[0].segments.slice(0, -1 - directorySegments.length);
  return { files: selected, matchedFiles: candidates.length, folderLabel: root.at(-1) ?? candidates[0].segments[0] ?? "" };
};
