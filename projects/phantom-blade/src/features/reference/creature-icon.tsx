import { Swords } from "lucide-react";
import ItemIcon from "../database/item-icon";

const CreatureIcon = ({ icon, name, size }: { icon?: string; name: string; size: number }) =>
  icon ? <ItemIcon icon={icon} name={name} size={size} />
    : <span className="grid shrink-0 place-items-center rounded-[var(--radius-md)] bg-danger/10 text-danger-text"
      style={{ width: size, height: size }}>
      <Swords size={size / 2} aria-hidden="true" />
    </span>;

export default CreatureIcon;
