import { Route } from "lucide-react";
import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent } from "../inspector/inspector-types.ts";
import { GAME_GUIDE_TUTORIALS } from "../../game-config.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import TutorialRoute from "./tutorial-guide-visuals.tsx";

type TutorialTopic = (typeof GAME_GUIDE_TUTORIALS)[number];

export const createTutorialGuideContent = (topic: TutorialTopic, display: RecipeSubjectDisplay,
  available: (subject: InspectorSubject) => boolean, t: TFunction): InspectorContent => {
  const key = `inspector.tutorialGuide.topics.${topic.id}`;
  return {
    name: t(`${key}.title`), category: t("inspector.subjectKinds.tutorial"),
    description: t(`${key}.summary`), image: display("item", topic.iconItemId).image, fallbackIcon: Route,
    guideSections: [{ key: `tutorial:${topic.id}`, title: t("inspector.tutorialGuide.route"),
      body: <TutorialRoute topic={topic} display={display} available={available} t={t} /> }],
  };
};
