import { Sparkles } from "lucide-react";
import { useState } from "react";
import { spellIconUrl } from "./spell-data";

const SpellIcon = ({ id, size = 34 }: { id?: number; name: string; size?: number }) => {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" className="flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-elevated text-accent" style={{ width: size, height: size }}>
    {id && !failed ? <img src={spellIconUrl(id)} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      : <Sparkles size={Math.round(size * 0.48)} aria-hidden="true" />}
  </span>;
};

export default SpellIcon;
