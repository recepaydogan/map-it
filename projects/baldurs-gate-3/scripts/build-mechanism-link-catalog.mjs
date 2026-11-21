import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const dialogRoot = path.join(projectRoot, "map-sources", "extracted", "dialogs", "GustavDev", "Act2", "Town");
const englishLocalizationPath = path.join(projectRoot, "map-sources", "converted", "localization", "english", "english.xml");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "mechanism-links.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const definitions = {
  DB_FOR_ThayanCellar_SecretDoors: {
    targetIndex: 0, controllerIndex: 1, controllerKind: "lever", targetKind: "door", action: "opens-closes",
  },
  DB_GOB_WolfPens_LeversAndCages: {
    targetIndex: 1, controllerIndex: 0, controllerKind: "lever", targetKind: "cage", action: "opens-closes",
  },
  DB_MOO_Prison_CellDoors: {
    targetIndex: 0, controllerIndex: 1, controllerKind: "lever", targetKind: "door", action: "opens-closes",
  },
  DB_IRN_DoorsLevers: {
    targetIndex: 0, controllerIndex: 1, controllerKind: "lever", targetKind: "door", action: "opens-closes",
  },
  DB_WYR_Axe_Buttons: {
    targetIndex: 0, controllerIndex: 1, controllerKind: "button", targetKind: "door", action: "opens-closes",
  },
  DB_SHA_Trials_TrialDoors: {
    targetIndex: 1, controllerIndex: 0, controllerKind: "trial-object", targetKind: "door", action: "trial-unlocks-door",
  },
};
const effectDefinitions = {
  DB_LOW_CazadorsPalace_Teleporters: {
    objectIndex: 0,
    controllerKind: "lever",
    accept: (object) => /ElevatorUp_/i.test(object.token),
    action: () => "moves-elevator-up",
  },
  DB_TUT_Misc_Elevator: {
    objectIndex: 5,
    controllerKind: "lever",
    action: () => "moves-elevator",
  },
  DB_UND_KethericStates_Hazards_PlatformLevers: {
    objectIndex: 1,
    controllerKind: "lever",
    action: (arguments_) => arguments_[2]?.trim() === "0" ? "moves-platform-horizontally" : "moves-platform-vertically",
  },
  DB_TUT_Misc_ElevatorLevers: {
    objectIndex: 1,
    controllerKind: "lever",
    accept: (object) => /(?:Down|Up)Lever_/i.test(object.token),
    action: (arguments_) => arguments_[2]?.includes("Down") ? "moves-elevator-down" : arguments_[2]?.includes("Up") ? "moves-elevator-up" : "moves-elevator",
  },
  DB_LOW_SteelWatchFoundry_SmallElevator_Stations: {
    objectIndex: 1,
    controllerKind: "lever",
    action: (arguments_) => arguments_[2]?.includes("Down") ? "moves-elevator-down" : "moves-elevator-up",
  },
  DB_TUT_TransformChamber_Levers: {
    objectIndex: 0,
    controllerKind: "lever",
    action: (arguments_) => ({
      TUT_TransformChamber_Aggressive: "makes-captives-hostile",
      TUT_TransformChamber_Destroy: "kills-captives",
      TUT_TransformChamber_Free: "frees-captives",
      TUT_TransformChamber_Transform: "activates-transformation-pod",
    })[arguments_[2]?.replaceAll('"', "").trim()],
  },
};
const groupedControllerDefinitions = {
  DB_CHA_MetalDoorLever: {
    controllerIndex: 0,
    controllerKind: "lever",
    targetKind: "gate",
    target: "S_CHA_FL1_MetalGateReplacement_1c9609ee-fc96-4826-bac1-856a609564ac",
    targetActionPattern: /PROC_Item(?:UnlockAndOpen|CloseAndLock)/,
    action: "opens-closes",
  },
  DB_LOW_HouseOfHope_PrisonButtons: {
    controllerIndex: 0,
    controllerKind: "button",
    targetKind: "door",
    target: "S_DOOR_HoH_Metal_Single_A_000_641d6a8a-1376-4232-a65f-71e06d3b48dd",
    targetActionPattern: /PROC_ItemUnlockAndOpen/,
    action: "unlocks-opens-once",
  },
  DB_LOW_Elfsong_OpenHiddenDoor: {
    controllerIndex: 0,
    controllerKind: "button",
    targetKind: "secret-door",
    target: "S_LOW_Elfsong_SecretDoor_0c7833f6-740c-47fb-b4a0-dec5eaa53cbd",
    targetActionPattern: /^Open\(/,
    action: "opens-secret-door",
  },
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});
const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  for (const character of body) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};
const endpoint = (argument) => {
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const id = token.match(new RegExp(`^[A-Za-z0-9_]+_(${guidPattern.source})$`, "i"))?.[1]?.toLocaleLowerCase("en-US");
  if (!id || id === "00000000-0000-0000-0000-000000000000") return null;
  return { id, token };
};
const decodeXmlText = (value) => value
  .replaceAll("&lt;br&gt;", "\n")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const englishLocalization = fs.readFileSync(englishLocalizationPath, "utf8");
const englishByHandle = new Map([...englishLocalization.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)]
  .map((match) => [match[1], decodeXmlText(match[2]).trim()]));
const plaqueClue = (token) => {
  const plaqueNumber = token.match(/Plaque_(\d{3})_/i)?.[1];
  if (!plaqueNumber) return null;
  const dialogPath = path.join(dialogRoot, `TWN_CentralSquare_Plaque_${plaqueNumber}_AD.lsj`);
  if (!fs.existsSync(dialogPath)) return null;
  const dialogText = fs.readFileSync(dialogPath, "utf8");
  const handle = dialogText.match(/"handle"\s*:\s*"([^"]+)"/)?.[1];
  return handle ? englishByHandle.get(handle) ?? null : null;
};

const storySources = walkFiles(storyRoot)
  .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))
  .map((filePath) => ({
    filePath,
    text: fs.readFileSync(filePath, "utf8"),
  }));

const links = new Map();
const effects = new Map();
const mobileControllers = new Map();
const movements = new Map();
for (const { filePath, text } of storySources) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const statement = lines[index].trim();
    const predicate = statement.match(/^([A-Za-z0-9_]+)\(/)?.[1];
    const definition = definitions[predicate];
    const effectDefinition = effectDefinitions[predicate];
    const groupedDefinition = groupedControllerDefinitions[predicate];
    if (!definition && !effectDefinition && !groupedDefinition) continue;
    const arguments_ = splitArguments(statement);
    if (groupedDefinition) {
      const controller = endpoint(arguments_[groupedDefinition.controllerIndex] ?? "");
      const target = endpoint(groupedDefinition.target);
      const targetActionIndex = lines.findIndex((line) => (
        line.includes(target.id) && groupedDefinition.targetActionPattern.test(line.trim())
      ));
      if (!controller) continue;
      if (!target || targetActionIndex < 0) {
        throw new Error(`Incomplete grouped mechanism extraction for ${predicate} in ${filePath}.`);
      }
      const id = `controls:${controller.id}:${target.id}`;
      const current = links.get(id) ?? {
        id,
        predicate,
        controllerKind: groupedDefinition.controllerKind,
        targetKind: groupedDefinition.targetKind,
        action: groupedDefinition.action,
        controller,
        target,
        evidence: [],
      };
      current.evidence.push({
        sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
        sourceLine: index + 1,
        statement,
      }, {
        sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
        sourceLine: targetActionIndex + 1,
        statement: lines[targetActionIndex].trim(),
      });
      links.set(id, current);
    }
    if (effectDefinition) {
      const object = endpoint(arguments_[effectDefinition.objectIndex] ?? "");
      const action = effectDefinition.action(arguments_);
      if (object && action && (!effectDefinition.accept || effectDefinition.accept(object, arguments_))) {
        const id = `effect:${object.id}:${action}`;
        const current = effects.get(id) ?? {
          id,
          predicate,
          controllerKind: effectDefinition.controllerKind,
          action,
          object,
          evidence: [],
        };
        current.evidence.push({
          sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
          sourceLine: index + 1,
          statement,
        });
        effects.set(id, current);
      }
    }
    if (!definition) continue;
    const target = endpoint(arguments_[definition.targetIndex] ?? "");
    const controller = endpoint(arguments_[definition.controllerIndex] ?? "");
    if (!target || !controller || target.id === controller.id) continue;
    const id = `controls:${controller.id}:${target.id}`;
    const current = links.get(id) ?? {
      id,
      predicate,
      controllerKind: definition.controllerKind,
      targetKind: definition.targetKind,
      action: definition.action,
      controller,
      target,
      evidence: [],
    };
    current.evidence.push({
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement,
    });
    links.set(id, current);
  }
}

const movementAction = (mover) => {
  const token = mover.token;
  if (/RaphaelVaultPortrait_Untrapped/i.test(token)) return null;
  if (/(?:LadderToOutside|DropDownLadder|SubmersibleInteriorLadder)/i.test(token)) return "deploys-shortcut-ladder";
  if (/ThayanOrb_/i.test(token)) return "traces-fire-surface-then-explodes";
  if (/Checkpoint_CMB_Boulder_/i.test(token)) return "rolls-along-damaging-path";
  if (/RaphaelVaultPortrait_/i.test(token)) return "reveals-hidden-safe";
  if (/(?:ArcaneTower_SecretWall|CentralSquare_Door)/i.test(token)) return "opens-closes-secret-passage";
  if (/(?:HiddenDoor|SecretDoor|SecretWall|CentralSquare_Door|Bookcase_Sliding_Door)/i.test(token)) return "opens-secret-passage";
  return null;
};

for (const { filePath, text } of storySources) {
  for (const match of text.matchAll(/(?<!\/\/)ItemMoveTo\([\s\S]*?\);/g)) {
    const statement = match[0].replace(/\s+/g, " ").trim();
    const arguments_ = splitArguments(statement);
    const object = endpoint(arguments_[0] ?? "");
    const destination = endpoint(arguments_[1] ?? "");
    const action = object ? movementAction(object) : null;
    if (!object || !destination || !action) continue;
    const id = `movement:${object.id}:${destination.id}:${action}`;
    const current = movements.get(id) ?? {
      id,
      predicate: "ItemMoveTo",
      action,
      object,
      destination,
      evidence: [],
    };
    current.evidence.push({
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: text.slice(0, match.index).split(/\r?\n/).length,
      statement,
    });
    movements.set(id, current);
  }
}

const sequenceFacts = storySources.flatMap(({ filePath, text }) => (
  [...text.matchAll(/DB_TWN_CentralSquare_Plaques_CorrectCombination\([^\r\n]+\);/g)]
    .map((match) => {
      const arguments_ = splitArguments(match[0]);
      return {
      order: Number(arguments_[0]),
      object: endpoint(arguments_[1] ?? ""),
      evidence: {
        sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
        sourceLine: text.slice(0, match.index).split(/\r?\n/).length,
        statement: match[0],
      },
    };
    })
)).filter(({ order, object }) => Number.isInteger(order) && object);
const centralSquareDoor = endpoint("S_TWN_CentralSquare_Door_00e95616-f09c-446e-aa97-8d241fc68189");
const sequences = [];
if (sequenceFacts.length > 0) {
  const steps = sequenceFacts.sort((left, right) => left.order - right.order);
  if (steps.length !== 3 || new Set(steps.map(({ order }) => order)).size !== 3 || !centralSquareDoor) {
    throw new Error("Incomplete Reithwin plaque sequence extraction.");
  }
  const sequence = {
    id: "sequence:twn-central-square-plaques",
    title: "Reithwin plaque sequence",
    solution: "OUR LADY OF LOSS\nMISTRESS OF PAIN\nWHEN NIGHT FALLS\nTHORM SHALL RISE",
    steps: steps.map(({ order, object, evidence }) => ({
      order,
      object,
      title: `Plaque ${object.token.match(/Plaque_(\d{3})_/i)?.[1] ?? order}`,
      ...(plaqueClue(object.token) ? { clue: plaqueClue(object.token) } : {}),
      evidence: [evidence],
    })),
    result: {
      object: centralSquareDoor,
      action: "opens-secret-passage",
    },
  };
  sequences.push(sequence);
  for (const step of sequence.steps) {
    const id = `controls:${step.object.id}:${centralSquareDoor.id}`;
    links.set(id, {
      id,
      predicate: "DB_TWN_CentralSquare_Plaques_CorrectCombination",
      controllerKind: "plaque",
      targetKind: "secret-door",
      action: "sequence-opens-secret-passage",
      controller: step.object,
      target: centralSquareDoor,
      evidence: step.evidence,
    });
  }
}

const transportPredicates = [
  "DB_TUT_Misc_Elevator",
  "DB_CRE_Dungeon_Elevator",
  "DB_DEN_General_ElevatorLevers",
  "DB_DEN_ElevatorPoints",
  "DB_COL_Elevator_Controllers",
  "DB_COL_Elevator_Positions",
  "DB_LOW_SteelWatchFoundry_SmallElevator_Stations",
  "DB_LOW_SteelWatchFoundry_SmallElevator_Levers",
];
const transportFacts = new Map(transportPredicates.map((predicate) => [predicate, []]));
for (const { filePath, text } of storySources) {
  for (const predicate of transportPredicates) {
    const pattern = new RegExp(`${predicate}\\([\\s\\S]*?\\);`, "g");
    for (const match of text.matchAll(pattern)) {
      const statement = match[0].replace(/\s+/g, " ").trim();
      transportFacts.get(predicate).push({
        arguments: splitArguments(statement),
        evidence: {
          sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
          sourceLine: text.slice(0, match.index).split(/\r?\n/).length,
          statement,
        },
      });
    }
  }
}

const addTransportLink = ({ predicate, controller, target, action, evidence }) => {
  if (!controller || !target || controller.id === target.id) return;
  const id = `controls:${controller.id}:${target.id}`;
  const current = links.get(id) ?? {
    id,
    predicate,
    controllerKind: "lever",
    targetKind: "elevator-stop",
    action,
    controller,
    target,
    evidence: [],
  };
  current.evidence.push(...evidence);
  links.set(id, current);
};

const addMobileControllerRoute = ({ predicate, controller, target, action, evidence }) => {
  if (!controller || !target || controller.id === target.id) return;
  const id = `mobile-controller:${controller.id}`;
  const current = mobileControllers.get(id) ?? {
    id,
    predicate,
    controllerKind: "lever",
    mobility: "platform-attached",
    controller,
    routes: [],
  };
  const routeId = `route:${controller.id}:${target.id}`;
  if (!current.routes.some((route) => route.id === routeId)) {
    current.routes.push({
      id: routeId,
      targetKind: "elevator-stop",
      target,
      action,
      evidence,
    });
  }
  mobileControllers.set(id, current);
};

for (const [predicate, downTriggerIndex, downLeverIndex, upTriggerIndex, upLeverIndex, toggleLeverIndex] of [
  ["DB_TUT_Misc_Elevator", 1, 2, 3, 4, 5],
  ["DB_CRE_Dungeon_Elevator", 1, 2, 3, 4, 5],
]) {
  for (const fact of transportFacts.get(predicate)) {
    const downTarget = endpoint(fact.arguments[downTriggerIndex] ?? "");
    const upTarget = endpoint(fact.arguments[upTriggerIndex] ?? "");
    const downController = endpoint(fact.arguments[downLeverIndex] ?? "");
    const upController = endpoint(fact.arguments[upLeverIndex] ?? "");
    const toggleController = endpoint(fact.arguments[toggleLeverIndex] ?? "");
    addTransportLink({ predicate, controller: downController, target: downTarget, action: "moves-elevator-down", evidence: [fact.evidence] });
    addTransportLink({ predicate, controller: upController, target: upTarget, action: "moves-elevator-up", evidence: [fact.evidence] });
    if (predicate === "DB_CRE_Dungeon_Elevator") {
      addMobileControllerRoute({ predicate, controller: toggleController, target: downTarget, action: "moves-elevator-down", evidence: [fact.evidence] });
      addMobileControllerRoute({ predicate, controller: toggleController, target: upTarget, action: "moves-elevator-up", evidence: [fact.evidence] });
    }
  }
}

const denControllers = transportFacts.get("DB_DEN_General_ElevatorLevers")
  .map((fact) => ({ endpoint: endpoint(fact.arguments[0] ?? ""), evidence: fact.evidence }))
  .filter(({ endpoint: object }) => object);
const denTargets = transportFacts.get("DB_DEN_ElevatorPoints")
  .map((fact) => ({ state: Number(fact.arguments[0]), endpoint: endpoint(fact.arguments[1] ?? ""), evidence: fact.evidence }))
  .filter(({ state, endpoint: object }) => Number.isInteger(state) && object);
for (const controller of denControllers) {
  for (const target of denTargets) {
    const addRoute = controller.endpoint.token.startsWith("S_PLT_") ? addMobileControllerRoute : addTransportLink;
    addRoute({
      predicate: "DB_DEN_General_ElevatorLevers",
      controller: controller.endpoint,
      target: target.endpoint,
      action: target.state === 1 ? "moves-elevator-up" : "moves-elevator-down",
      evidence: [controller.evidence, target.evidence],
    });
  }
}

const colonyTargets = new Map(transportFacts.get("DB_COL_Elevator_Positions")
  .map((fact) => [Number(fact.arguments[0]), { endpoint: endpoint(fact.arguments[1] ?? ""), evidence: fact.evidence }])
  .filter(([state, target]) => Number.isInteger(state) && target.endpoint));
for (const fact of transportFacts.get("DB_COL_Elevator_Controllers")) {
  const state = Number(fact.arguments[0]);
  const controller = endpoint(fact.arguments[1] ?? "");
  const targetStates = state === -1 ? [0, 1] : [state];
  for (const targetState of targetStates) {
    const target = colonyTargets.get(targetState);
    if (!target) continue;
    const addRoute = state === -1 ? addMobileControllerRoute : addTransportLink;
    addRoute({
      predicate: "DB_COL_Elevator_Controllers",
      controller,
      target: target.endpoint,
      action: targetState === 1 ? "moves-elevator-up" : "moves-elevator-down",
      evidence: [fact.evidence, target.evidence],
    });
  }
}

const foundryStations = transportFacts.get("DB_LOW_SteelWatchFoundry_SmallElevator_Stations")
  .map((fact) => ({
    target: endpoint(fact.arguments[0] ?? ""),
    controller: endpoint(fact.arguments[1] ?? ""),
    direction: fact.arguments[2]?.replaceAll('"', "").trim(),
    evidence: fact.evidence,
  }))
  .filter(({ target, controller }) => target && controller);
for (const station of foundryStations) {
  addTransportLink({
    predicate: "DB_LOW_SteelWatchFoundry_SmallElevator_Stations",
    controller: station.controller,
    target: station.target,
    action: station.direction === "Up" ? "moves-elevator-up" : "moves-elevator-down",
    evidence: [station.evidence],
  });
}
const foundryStationControllerIds = new Set(foundryStations.map(({ controller }) => controller.id));
for (const fact of transportFacts.get("DB_LOW_SteelWatchFoundry_SmallElevator_Levers")) {
  const controller = endpoint(fact.arguments[0] ?? "");
  if (!controller || foundryStationControllerIds.has(controller.id)) continue;
  for (const station of foundryStations) {
    addMobileControllerRoute({
      predicate: "DB_LOW_SteelWatchFoundry_SmallElevator_Levers",
      controller,
      target: station.target,
      action: station.direction === "Up" ? "moves-elevator-up" : "moves-elevator-down",
      evidence: [fact.evidence, station.evidence],
    });
  }
}

const entries = [...links.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
const effectEntries = [...effects.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
const movementEntries = [...movements.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
const mobileControllerEntries = [...mobileControllers.values()]
  .map((entry) => ({
    ...entry,
    routes: entry.routes.sort((left, right) => left.id.localeCompare(right.id, "en")),
  }))
  .sort((left, right) => left.id.localeCompare(right.id, "en"));
const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    exactLinks: entries.length,
    exactEffects: effectEntries.length,
    exactMovements: movementEntries.length,
    movementObjects: new Set(movementEntries.map(({ object }) => object.id)).size,
    sequencePuzzles: sequences.length,
    sequenceSteps: sequences.reduce((total, sequence) => total + sequence.steps.length, 0),
    mobileControllers: mobileControllerEntries.length,
    mobileRoutes: mobileControllerEntries.reduce((total, entry) => total + entry.routes.length, 0),
    levers: entries.filter(({ controllerKind }) => controllerKind === "lever").length,
    buttons: entries.filter(({ controllerKind }) => controllerKind === "button").length,
    trialObjects: entries.filter(({ controllerKind }) => controllerKind === "trial-object").length,
    plaques: entries.filter(({ controllerKind }) => controllerKind === "plaque").length,
    linkedObjects: new Set(entries.flatMap(({ controller, target }) => [controller.id, target.id])).size,
    effectObjects: new Set(effectEntries.map(({ object }) => object.id)).size,
  },
  links: entries,
  effects: effectEntries,
  movements: movementEntries,
  sequences,
  mobileControllers: mobileControllerEntries,
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Mechanisms: ${catalog.stats.exactLinks} fixed links, ${catalog.stats.mobileRoutes} mobile routes, ${catalog.stats.exactEffects} exact effects, and ${catalog.stats.exactMovements} exact movements cataloged.`);
