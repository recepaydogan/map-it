# AGENTS.md - Project Rules

## Core Principles

- **KISS (Keep It Simple, Stupid):** Keep code simple and straightforward. Avoid unnecessary complexity.
- **DRY (Don't Repeat Yourself):** Never duplicate logic. Extract reusable components, hooks, and utilities.
- **Reusable Components:** Always build with reusability in mind. If a UI element or logic appears more than once, extract it into a shared component or hook.
- **Best Approach Always:** Regardless of the task, always apply the best practice and most optimal approach for the given problem. See _Industry-Standard Best Approach_ below for the concrete standard every change must meet.

## Language — English Only in Code

- **All code and notes are written exclusively in English.** This includes identifiers (variables, functions, components, types, files), comments, commit messages, code-level documentation, TODOs, and any annotation that lives in the codebase. No language other than English may appear in code or notes — ever, no exceptions.
- This rule is about the **artifacts you produce in the repo**. Conversing with the user in their language is fine; the code and everything written into it stays English.
- **User-facing display strings go through the i18n layer (`src/i18n/`), never hardcoded in components.** Author every UI string as a key in `src/i18n/locales/en.json` (the source-of-truth catalog) and render it via `useTranslation()` → `t("key")`; the sibling `<code>.json` catalogs hold the other languages, lazy-loaded per language. English is the fallback. Keys, identifiers, code and comments stay English — only the catalog VALUES are translated. Data-driven labels (categories, presets, layers) are localised once at their source in `map-experience.tsx` so consumers need no per-site edits. Game CONTENT (item/boss/region names + descriptions) is localised separately in the data layer (per-language FMG overlays), NOT in these catalogs.

## Mandatory Behavior — Speak Up Before You Code

These rules are **non-negotiable** and apply 100% of the time, on every task, no matter how small. They override the default tendency to "just do the minimal thing the user asked for".

- **Better-Approach Disclosure (100%):** If you believe there is a better way to accomplish what the user requested — a cleaner architecture, a simpler API, a more idiomatic pattern, a more performant solution, a safer abstraction — you **must** surface it before implementing. State the user's approach, your proposed alternative, the trade-offs, and ask which to proceed with. Never silently "do it the user's way" while knowing a better way exists. Never silently "do it your way" without asking.
- **Rule-Violation Warning (100%):** If the component, file, or change the user is asking you to work on violates a React best practice, an architectural rule, an industry standard (SOLID, separation of concerns, accessibility, security, performance), or any rule in this AGENTS.md, you **must** stop and warn the user before touching the code. Describe the violation precisely, explain why it matters, propose the correct approach, and wait for explicit approval before proceeding. Do not "just patch it and move on".
- **Approval Gate:** After raising a concern under either rule above, only proceed once the user explicitly approves a path forward. If they reject the suggestion and want the original ask, do exactly that — but the warning must still have happened first.
- **Why this exists:** Silent compliance with a suboptimal request compounds tech debt and erodes trust. The user wants a collaborator who flags problems, not a tool that rubber-stamps requests.

## Git Operations — Never Commit or Push Without Explicit Approval

These rules are **non-negotiable** and apply 100% of the time, with zero exceptions.

- **Never run `git commit`.** Do not create commits on the user's behalf unless the user has, in the current turn, explicitly asked for the commit ("commit this", "yes, commit"). Staging (`git add`) is allowed to prepare a proposed commit, but the commit itself always requires an explicit ask.
- **Never run `git push` (or `git push --force`, `git push --all`, `git push --tags`, or any variant).** Pushing is visible to others and, in the case of force-push, rewrites shared history. Always ask first, even if a previous commit was approved — commit approval is not push approval.
- **Never run history-rewriting commands** (`git filter-repo`, `git rebase`, `git reset --hard`, `git commit --amend` on pushed commits, etc.) without a separate explicit approval naming that specific action.
- **"Proceed with your plan" / "go ahead" / "continue as you proposed" is NOT a standing authorization** for commits or pushes. If a plan includes git operations, pause at each commit boundary and each push boundary to confirm.
- **No exceptions for "obvious" or "trivial" cases.** A one-line config file addition, a typo fix, a verification file — all still require explicit approval before commit and before push. The cost of asking is zero; the cost of an unwanted commit in the user's public git history is real.
- **When you believe a commit/push is needed, propose it and wait.** Describe what you would commit (file list, message), then stop. Do not execute until the user says yes.

### Commit Workflow — When the User Says "commit"

When the user explicitly says **"commit"** (or equivalent), follow this workflow exactly — no clarifying question needed unless something is ambiguous:

1. **Read the full diff before deciding anything.** `git status` + `git diff --stat HEAD` first, then inspect the actual diffs of any file you don't already understand. You cannot group correctly without knowing what each file does. **Never** commit blind based on file names or change counts alone.
2. **Split by concern. Splitting is the default — not the exception.** The word "commit" from the user is **not** an instruction to make exactly one commit; it is an instruction to land the working tree as **as many commits as the changeset honestly needs**. One cohesive change → one commit. Multiple distinct concerns → one commit per concern, no exceptions.
   - **Heuristic — the "two-sentence test":** If you can describe the staged set only by writing a commit message with **"and"** / **"+"** joining two or more unrelated nouns ("Add X **and** Y", "Refactor A **+** add feature B"), that is a confession that you are about to bundle distinct concerns. Split.
   - **What counts as a distinct concern (each gets its own commit):**
     - A refactor (e.g. consolidating modules) vs. a new feature that happens to use the refactored code.
     - Two independent features, even if both touch the same files.
     - A feature vs. unrelated UI polish that rode along in the working tree.
     - A backend change (socket-server, migration, edge function) vs. a frontend feature, unless they exist solely to serve each other and are useless apart.
     - A dependency bump (`package.json` / lockfile) belongs with whichever commit introduces the first call site — never as a standalone "deps" commit unless the bump is truly standalone.
   - **What does NOT justify bundling:**
     - "These changes share a file." A shared file (a barrel export, a service module, a store) is exactly the case for `git add -p` / per-hunk staging. Sharing a file means you must split hunks, not that you must merge concerns.
     - "Intermediate commits won't typecheck in isolation." On a feature branch this is acceptable; the branch as a whole compiles when merged. Do not collapse meaningful history for transient compile cleanliness.
     - "Splitting is tedious." Tedious is not a justification. If the changeset is large, the split is more valuable, not less.
     - "I'm not 100% sure where this hunk belongs." Pick the most plausible commit and proceed; do not bundle out of indecision.
   - **The one legitimate single-commit case:** every file in the working tree serves the same narrow concern and removing any one would leave the others nonsensical. If you cannot articulate that out loud, you have more than one concern.
3. **Stage one group at a time.** For each group identified in step 2, stage **only** that group's files (or hunks, via `git add -p`, when a file straddles groups), then commit, then move to the next group. Do not stage everything upfront and try to unstage later — that is how concerns leak into the wrong commit. Skip files that should not be committed at all (secrets, large binaries, unrelated stray edits) — surface those to the user before continuing.
4. **Write minimal commit messages.** Imperative, concise (one short line). No body unless the _why_ would otherwise be lost. No `Co-Authored-By` footer unless the user requested it. No emoji. Match the repo's existing message style (look at `git log --oneline -10` first — this repo uses Title Case scope-style messages like "Polish draft prep UI layout", not strict lowercase).
5. **Execute the commits and report.** Run the commit(s) in order, then briefly list what landed (commit hashes + one-line summaries + file count per commit). Do not push.

## Styling

- **Always use `twMerge`** (from `tailwind-merge`) when composing Tailwind class strings, especially when merging conditional classes, default classes with prop-passed classes, or any string concatenation of utility classes. Never use raw template literals or string concatenation for class composition — `twMerge` is mandatory.

## Naming Conventions

- **All files use kebab-case.** Examples: `game-shell.tsx`, `use-game-session.ts`, `game-config.ts`. This applies to components, hooks, utilities, configs, types — every file, no exceptions.
- **Never introduce camelCase or PascalCase filenames.** The few legacy camelCase files (`avatarUpload.tsx`, `topBar.tsx`, `adContainer.tsx`) are technical debt, not a precedent. If you touch one of them for a real change, rename it to kebab-case in the same commit.
- **Directory names also use kebab-case** where applicable (e.g., `src/games/lol/modes/splash/`).

## Anti-Duplication & Parametrization

Duplication is the single largest source of tech debt in this codebase. These rules are **non-negotiable** and must be checked **before** writing any new file.

- **Pre-flight grep (mandatory):** Before creating any new file under `src/pages/`, `src/games/*/modes/`, `src/games/*/components/`, or `src/components/`, grep adjacent folders for a sibling with a similar name or role. If a sibling exists that you would "copy and tweak", STOP — extract a generic instead.
- **60% duplication rule:** If a new file would be structurally ≥60% identical to an existing peer (same imports, same hooks, same JSX skeleton, only values/components differ), you **must not** copy-paste. Refactor the peer into a generic component parametrized by a config object, then add the new variant as a config.
- **Parallel-folder smell:** `games/{a}/x.tsx` and `games/{b}/x.tsx` being ≥60% identical is a signal the shared part belongs in `src/components/game/` or `src/core/`. Surface this before implementing.
- **Config-driven generics over factory functions.** When parametrizing by variant (game, theme, role, mode), prefer `<GenericComponent config={...} />` over a factory like `createXPage(config)` that returns a component. Factories break React DevTools display names, Fast Refresh, and TypeScript inference.
- **No `as SomeMode` casts at the call site.** If you find yourself casting `string → Mode` in a page/handler, the generic is not typed tightly enough — fix the generic, don't suppress the type.
- **Add, don't fork.** Adding a new game must mean writing one config file — not copying a page template. If the generic can't express a new variant, extend the generic once; do not duplicate it.

## React Component File Organization

Component files must be properly decomposed, the React way. A single `.tsx` file accumulating every component, sub-component, hook, and helper for a feature (e.g. a 1000-line file like `scenario-wd-insights-tab.tsx`) is a violation — it hurts readability, reuse, testability, and Fast Refresh.

**The single most common failure mode here is "everything in one file".** An agent asked to build a feature tends to dump the whole thing — parent component, every sub-component, hooks, helpers, constants, types — into one giant `.tsx`, producing the 300 / 500 / 700-line monoliths you keep seeing. This is **not** how idiomatic React is written. Real React codebases are decomposed aggressively: each component is broken down into the smallest meaningful pieces, helpers and hooks are pulled out, and you end up with many small focused files rather than a few huge ones. **Default to splitting.** When in doubt, make another file — small, single-purpose files are the goal, not the exception.

- **One primary concern per file.** A component file owns one component (plus tightly-coupled, file-private sub-pieces that are never used elsewhere). The moment a sub-component, hook, or helper is reusable — or the file grows past a comfortable reading size — extract it into its own kebab-case file.
- **Decompose to the smallest sensible piece.** Break a component down until each file does one thing: a card, a row, a header, a toolbar, a single field. Prefer ten 60-line files over one 600-line file. A reader should grasp a file's whole job in one screen.
- **Split sub-components into their own files.** Distinct, named sub-components belong in sibling files (e.g. `scenario-wd-insights-tab/` with `header.tsx`, `insight-card.tsx`, `summary-row.tsx`), imported by the parent. Do not stack many exported components in one file.
- **Hooks live in their own files.** Custom hooks (`use-*.ts`) are extracted, not defined inline alongside JSX.
- **Pure helpers and constants live in their own files.** Formatting, mapping, and computation helpers go in colocated `*-utils.ts` (or a shared util) — not buried among component definitions. Shared types go in a `types.ts` next to the feature.
- **Size guidance — split by concern, never just to hit a number, but treat size as a hard signal:**
  - **~150 lines:** comfortable. No action needed.
  - **~300 lines:** a real warning sign. Before adding more, stop and ask "what cohesive piece can I extract right now?" — usually there are already 2–3 sub-components or helpers hiding in here.
  - **500+ lines:** treat as a defect, not a style nit. A file this size is almost always several concerns fused together. If you are creating or substantially editing such a file, decompose it as part of the work — do not ship a new 500/700-line component.
- **Folder-per-feature when it grows.** When a feature spans a parent + several sub-components/hooks/utils, group them in a feature folder with an `index.ts` barrel rather than one mega-file or a flat scatter.
- **Plan the file layout before writing.** When asked to build a non-trivial component or feature, first decide the breakdown — which sub-components, hooks, and util files it splits into — and create them as separate files from the start. Do not write it all in one file "to split later"; later rarely comes.
- **This applies going forward.** Do not retrofit existing oversized files unless explicitly asked; when you do touch one for a real change, decompose the part you are working on.

## Pre-Flight Checklist (run before every non-trivial edit)

1. Grep for similar existing files/components — am I about to duplicate something that already exists?
2. Is the file I'm about to create or edit named in kebab-case?
3. Does my change belong at the layer I'm putting it in, or is it leaking (e.g., Overwolf call inside a component, business logic inside a page)?
4. If this is a React component: is it a client-concern (UI) or a domain-concern (logic)? Keep them separate.

## Overwolf

- When working on anything Overwolf-related, **always perform a web search** to consult the official Overwolf documentation before writing or modifying code.

## UI/UX

- All UI/UX work **must be visually consistent** with the rest of the application.
- When designing or implementing UI/UX, **always use the `ui-ux-pro-max` skill**.
- **Library-built components must be consistent with the rest of the app and with each other.** Components composed from third-party primitives (Radix, dnd-kit, Vaul, headless UI, etc.) are subject to the same visual rules as everything else. Two surfaces that play the same role — two team pickers, two delete confirmations, two empty states, two lane chips — must share **one** component, not two near-copies that drifted on padding, typography, or hover state. If you find yourself reaching for a Radix primitive and the same UX already exists somewhere else, extract a shared wrapper before adding the second copy.
- **Before composing a Radix/dnd-kit/etc. primitive, grep for a sibling.** Same rule as the anti-duplication pre-flight: if `DropdownMenu` already wraps a "pick which X" affordance with the chrome you want, parametrise it instead of repeating. The 60% duplication rule applies to library-wrapping components just as it does to pages and feature components — a hand-styled trigger button is a hunk that drifts; a shared wrapper does not.
- **Never use native `<select>`/`<option>` for picker UI in this app.** The OS paints the option list outside the React DOM (white background on dark themes, blue OS highlight, unstyleable). Use Radix `DropdownMenu` + `DropdownMenuItem`. The only exception is screen-reader-critical forms where the native control is required for assistive tech — flag that case and explain why.
- **No UI element may overlap the Overwolf ads area.** Modals, popovers, dialogs, dropdowns, toasts, tooltips, drawers — nothing renders on top of, behind (peeking out), or extending into the ads strip. The ads area is sacred real estate; ad-network policies forbid occlusion, and a covered ad will not impress and can be flagged as fraudulent.
  - Every full-screen overlay (anything using `fixed inset-0`, a `Dialog`, a portal-mounted backdrop, etc.) **must be constrained to the non-ads region of the viewport** when running inside Overwolf. The constraint is content-layer, not just visual: clicks targeting the ads strip must reach the ad, not the modal backdrop.
  - The ads area width is `var(--ow-ads-width)` (currently 440px, defined in `src/app/globals.css`). The non-ads region is therefore `calc(100vw - var(--ow-ads-width))` when `isOverwolfContext()` is true.
  - When adding any new modal/overlay primitive, you **must** verify it respects this constraint in the Overwolf build — both visually (does not paint over the ads) and behaviorally (does not capture pointer events over the ads). If your primitive uses Radix/portal-based mounting, scope its portal to the non-ads container, not `document.body`.

## Industry-Standard Best Approach

Every change — fixes, features, refactors — must meet the industry-standard bar, not just "it works on my machine".

- **Fix the root cause, not the symptom.** Diagnose _why_ something is broken before changing code. A patch that hides a bug is a regression waiting to happen.
- **Assume nothing about ordering.** Async operations (HTTP requests, DB writes, fire-and-forget promises) may arrive out of order. Writes targeting the same resource must be serialized or coalesced at the layer that owns the concern.
- **Defense in depth.** Correctness-critical paths should survive a failure at any single layer. Combine atomic domain actions with a robust sync/transport layer.
- **Idempotency.** Any operation that can be retried must be safe to run more than once without corrupting state.
- **Solve it at the lowest layer that owns the concern.** A fix must not force every caller to work around the issue.
- **No silent failures.** Swallowing an error with an empty catch is unacceptable unless there is a deliberate, documented reason.
