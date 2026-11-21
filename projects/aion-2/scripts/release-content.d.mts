export interface ReleaseContentFile {
  path: string;
  sourcePath: string;
  size: number;
  sha256: string;
}

export interface ReleaseContentPlan {
  files: ReleaseContentFile[];
  fingerprint: string;
}

export function createReleaseContentPlan(root: string): Promise<ReleaseContentPlan>;
