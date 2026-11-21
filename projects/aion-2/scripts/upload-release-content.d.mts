import type { ReleaseContentPlan } from "./release-content.mjs";

export function releaseContentBaseUrl(value: string | undefined, fingerprint: string): string;
export function uploadReleaseContent(plan: ReleaseContentPlan, env: Record<string, string>): Promise<string>;
