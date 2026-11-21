import { contentUrl } from "../../lib/content-url";
const ItemIcon = ({ icon, size = 36, onError }: { icon?: string; name: string; size?: number; onError?: () => void }) => icon ? (
  <span
    className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/30 text-accent"
    style={{ width: size, height: size }}
  >
    <img
      src={contentUrl(`${icon}`)}
      alt=""
      className="h-full w-full object-contain"
      onError={onError}
    />
  </span>
) : null;

export default ItemIcon;
