import type { ReferenceFact } from "./reference-types";

export interface CompanionProgression {
  version: 1;
  pets: Record<string, { genus: string; statGroup: string | null; runSpeed: number; sprintSpeed: number }>;
  statGroups: Record<string, { level: number; stats: ReferenceFact[] }[]>;
  levels: { level: number; soulsToNextLevel: number; genusExperience: number }[];
  genera: Record<string, {
    name: string;
    slotLevels: number[];
    analysisCrystals: number;
    analysisCurrency: number;
    levels: {
      level: number;
      experienceToNextLevel: number;
      analysisExperience: number;
      grades: { grade: string; percent: number }[];
    }[];
  }>;
}
