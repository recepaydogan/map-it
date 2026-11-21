import { skillDescriptionParts } from "./skill-description-parts";

const SkillDescriptionText = ({ text }: { text: string }) => <>{skillDescriptionParts(text).map((part, index) =>
  part.color ? <span key={index} className={part.color}>{part.text}</span> : part.text)}</>;

export default SkillDescriptionText;
