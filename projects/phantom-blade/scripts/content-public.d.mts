import type { ReleasePlan } from "./release-content.mjs";
export function copyBundledPublic(output: string): Promise<void>;
export function verifyPublishedPlan(plan: ReleasePlan | null, env: Record<string, string>): Promise<{ fingerprint: string; baseUrl: string; manifestSha256: string }>;
