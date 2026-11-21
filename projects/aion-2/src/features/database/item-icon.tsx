import { getItemDisplayName } from "../../lib/item-display-name";
import { contentUrl } from "../../lib/content-url";
import { useGameText } from "../../i18n/game-text";
import { Package } from "lucide-react";

const ItemIcon = ({ icon, name, size = 36 }: { icon?: string; name: string; size?: number }) => {
  const gameText = useGameText();
  return (
  <span
    className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/30 text-accent"
    style={{ width: size, height: size }}
  >
    {icon ? <img
      src={contentUrl(icon)}
      alt=""
      className="h-full w-full object-contain"
    /> : <Package size={size / 2} aria-label={getItemDisplayName(name, gameText(name))} />}
  </span>
  );
};

export default ItemIcon;
