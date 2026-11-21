import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReviewedStoryRuleReader } from "./reviewed-story-rules.mjs";
import { bindStoryArguments, substituteStoryArguments } from "./story-destination.mjs";
import { parseEndpoint, splitArguments } from "./story-goal-facts.mjs";
import { readStorySceneRecipe } from "./story-scene-recipe.mjs";

export const readReviewedNpcScenes = (filename, projectRoot, facts) => {
  const hashes = {};
  const read = (file) => {
    const absolute = path.resolve(projectRoot, file), bytes = fs.readFileSync(absolute);
    hashes[path.relative(projectRoot, absolute).split(path.sep).join("/")] = createHash("sha256").update(bytes).digest("hex");
    return bytes.toString("utf8");
  };
  const recipe = readStorySceneRecipe(filename, read, projectRoot);
  const { verify } = createReviewedStoryRuleReader(read);
  const rules = new Map();
  for (const review of recipe.reviews) {
    if (rules.has(review.id)) throw new Error(`Duplicate NPC review: ${review.id}`);
    rules.set(review.id, verify(review));
  }
  const scenes = recipe.scenes.flatMap((scene) => {
    const movement = rules.get(scene.movementReview), exclusion = rules.get(scene.avatarExclusionReview);
    if (!movement || !exclusion || !scene.reviews.includes(scene.movementReview) || !scene.reviews.includes(scene.avatarExclusionReview)
      || [scene.movementReview, scene.avatarExclusionReview].some((id) => recipe.reviews.find((review) => review.id === id).sourcePath !== scene.sourcePath)) {
      throw new Error(`Missing NPC role review: ${scene.id}`);
    }
    const guard = movement.guards.find((statement) => statement.startsWith(`${scene.tablePredicate}(`));
    const excludeGuard = exclusion.guards.find((statement) => statement.startsWith(`${scene.tablePredicate}(`));
    if (!guard || !excludeGuard || !exclusion.actions.includes(`NOT ${excludeGuard}`)
      || !exclusion.guards.includes(`${scene.avatarPredicate}(${splitArguments(excludeGuard)[scene.actorArgument]})`)) {
      throw new Error(`NPC table does not explicitly exclude avatars: ${scene.id}`);
    }
    if (!/^(?:TeleportTo|CharacterMoveTo|PROC_CharacterMoveTo)\(/.test(movement.statement)) throw new Error(`Not an NPC movement: ${scene.id}`);
    const reviews = scene.reviews.flatMap((id) => {
      if (!rules.has(id)) throw new Error(`Unknown NPC review: ${id}`);
      return rules.get(id).evidence;
    });
    const rows = facts.filter(({ section, negated, predicate, evidence }) => section === "init" && !negated
      && predicate === scene.tablePredicate && evidence.sourcePath === scene.sourcePath);
    if (!rows.length) throw new Error(`No native NPC rows: ${scene.id}`);
    return rows.map((row) => {
      const bindings = bindStoryArguments(splitArguments(guard), row.arguments);
      const actorId = parseEndpoint(row.arguments[scene.actorArgument])?.id, anchorId = parseEndpoint(row.arguments[scene.anchorArgument])?.id;
      const moveArgs = bindings && substituteStoryArguments(splitArguments(movement.statement), bindings);
      if (!actorId || !anchorId || parseEndpoint(moveArgs?.[0] ?? "")?.id !== actorId || parseEndpoint(moveArgs?.[1] ?? "")?.id !== anchorId) {
        throw new Error(`Invalid NPC actor/anchor binding: ${scene.id}:${row.evidence.sourceLine}`);
      }
      return { id: scene.id, actorId, anchorId, declaration: row.evidence,
        movement: { sourcePath: scene.sourcePath, sourceLine: recipe.reviews.find(({ id }) => id === scene.movementReview).actionLine,
          statement: movement.statement },
        evidence: [...new Map([row.evidence, ...reviews].map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] };
    });
  });
  for (const scene of recipe.directScenes ?? []) {
    const movement = rules.get(scene.movementReview), role = rules.get(scene.roleReview);
    if (!movement || !role || !scene.reviews.includes(scene.movementReview) || !scene.reviews.includes(scene.roleReview)
      || [scene.movementReview, scene.roleReview].some((id) => recipe.reviews.find((review) => review.id === id).sourcePath !== scene.sourcePath)) {
      throw new Error(`Missing direct NPC role review: ${scene.id}`);
    }
    const [actor, anchor] = splitArguments(movement.statement).map(parseEndpoint);
    if (!/^(?:TeleportTo|CharacterMoveTo|PROC_CharacterMoveTo)\(/.test(movement.statement)
      || actor?.id !== scene.characterContentId || anchor?.id !== scene.anchorContentId) throw new Error(`Wrong direct NPC movement: ${scene.id}`);
    const roleAction = role.actions.find((statement) => statement.startsWith(`${scene.rolePredicate}(`)
      && parseEndpoint(splitArguments(statement)[0])?.id === actor.id);
    const linked = movement.guards.includes(scene.roleLink) && role.actions.includes(scene.roleLink)
      || movement.actions.includes(scene.roleLink) && role.guards.includes(scene.roleLink);
    if (!roleAction || !/^DB_\w+\(/.test(scene.roleLink) || !linked) throw new Error(`Unbound NPC role transition: ${scene.id}`);
    const contract = recipe.roleContracts?.find(({ id }) => id === scene.roleContract);
    if (!contract?.reviews?.length || contract.reviews.some((id) => !scene.reviews.includes(id))) throw new Error(`Missing NPC runtime contract: ${scene.id}`);
    let invocation = roleAction;
    for (const [index, id] of contract.reviews.entries()) {
      const runtime = rules.get(id);
      if (!runtime || invocation.slice(0, invocation.indexOf("(")) !== runtime.guards[0].slice(0, runtime.guards[0].indexOf("("))) {
        throw new Error(`Wrong NPC runtime procedure: ${scene.id}/${id}`);
      }
      const bindings = bindStoryArguments(splitArguments(runtime.guards[0]), splitArguments(invocation));
      if (!bindings) throw new Error(`NPC runtime actor does not bind: ${scene.id}/${id}`);
      const boundActor = (statement) => parseEndpoint(substituteStoryArguments(splitArguments(statement), bindings)[0])?.id === actor.id;
      if (index + 1 < contract.reviews.length) {
        const next = rules.get(contract.reviews[index + 1]);
        const predicate = next?.guards[0].slice(0, next.guards[0].indexOf("("));
        const action = runtime.actions.find((statement) => statement.startsWith(`${predicate}(`) && boundActor(statement));
        if (runtime.guards.length !== 1 || !action) throw new Error(`Guarded or unbound NPC runtime forwarding: ${scene.id}/${id}`);
        invocation = `${predicate}(${substituteStoryArguments(splitArguments(action), bindings).join(",")})`;
      } else if (!runtime.guards.some((statement) => statement.startsWith(`NOT ${contract.avatarPredicate}(`) && boundActor(statement))
        || !runtime.actions.some((statement) => statement.startsWith(`${contract.npcPredicate}(`) && boundActor(statement))
        || !runtime.actions.some((statement) => statement.startsWith(`NOT ${contract.playerPredicate}(`) && boundActor(statement))) {
        throw new Error(`NPC runtime lacks avatar exclusion and conversion: ${scene.id}`);
      }
    }
    const evidence = scene.reviews.flatMap((id) => {
      if (!rules.has(id)) throw new Error(`Unknown direct NPC review: ${id}`);
      return rules.get(id).evidence;
    });
    const arrivalEvidence = [];
    if (scene.arrivalState) {
      // An explicitly reviewed death in this same movement rule applies under
      // exactly the same runtime guards, not under an unrelated death event.
      const death = movement.actions.find((statement) => statement.startsWith("Die(") && parseEndpoint(splitArguments(statement)[0])?.id === actor.id);
      if (scene.arrivalState !== "corpse" || !death) throw new Error(`Unproven direct NPC arrival state: ${scene.id}`);
      arrivalEvidence.push(...movement.evidence);
    }
    scenes.push({ id: scene.id, actorId: actor.id, anchorId: anchor.id,
      movement: { sourcePath: scene.sourcePath, sourceLine: recipe.reviews.find(({ id }) => id === scene.movementReview).actionLine,
        statement: movement.statement },
      ...(arrivalEvidence.length ? { arrivalEvidence } : {}),
      evidence: [...new Map(evidence.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] });
  }
  const excludedActorName = new RegExp(recipe.excludedActorNamePattern, "i");
  return { hashes, scenes, excludedActorName,
    resolve: (actorId, anchorId, evidence) => scenes.find((scene) => scene.actorId === actorId && scene.anchorId === anchorId
      && [scene.declaration, scene.movement].filter(Boolean).every((proof) => evidence.some((entry) => entry.sourcePath === proof.sourcePath
        && entry.sourceLine === proof.sourceLine && entry.statement === proof.statement))) };
};
