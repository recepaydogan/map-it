import { twMerge } from "tailwind-merge";

type ClassValue = string | number | null | false | undefined;

/**
 * Compose Tailwind class strings with conflict resolution.
 *
 * Mandated by AGENTS.md: never concatenate utility classes by hand — later
 * classes must win over earlier ones, which only twMerge guarantees.
 */
export const cn = (...classes: ClassValue[]): string =>
  twMerge(classes.filter(Boolean).join(" "));
