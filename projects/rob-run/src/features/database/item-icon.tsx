import { contentUrl } from "../../lib/content-url";
import { cn } from "../../lib/cn";

const ItemIcon = ({ icon, size = 36, onError, className, loading }: {
  icon?: string; name: string; size?: number; onError?: () => void; className?: string; loading?: "eager" | "lazy";
}) => icon ? (
  <span
    className={cn("grid shrink-0 grid-cols-1 grid-rows-1 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/30 text-accent", className)}
    style={{ width: size, height: size }}
  >
    <img
      src={contentUrl(`${icon}`)}
      alt=""
      className="h-full w-full object-contain"
      loading={loading}
      onError={onError}
    />
  </span>
) : null;

export default ItemIcon;
