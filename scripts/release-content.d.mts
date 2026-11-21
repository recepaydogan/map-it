export interface ReleaseFile { path: string; sourcePath: string; size: number; sha256: string; }
export interface ReleasePlan { files: ReleaseFile[]; fingerprint: string; totalBytes: number; }
export function createReleaseContentPlan(): Promise<ReleasePlan>;
export function isRemoteContent(path: string): boolean;
