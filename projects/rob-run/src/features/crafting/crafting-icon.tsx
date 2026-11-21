import { Hammer } from "lucide-react";
import { useState } from "react";
import ItemIcon from "../database/item-icon";

export default function CraftingIcon({ icon, name, size = 38 }: { icon?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState<string | undefined>();
  return icon && failed !== icon ? <ItemIcon icon={icon} name={name} size={size} onError={() => setFailed(icon)} />
    : <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border bg-surface text-subtle"><Hammer size={Math.round(size / 2)} aria-hidden="true" /></span>;
}
