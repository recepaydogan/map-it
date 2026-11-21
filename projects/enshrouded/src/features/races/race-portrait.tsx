import { contentUrl } from "../../lib/content-url";
const RacePortrait = ({ icon, size }: { icon: string; size: number }) => <span className="block shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/30" style={{ width: size, height: size }}>
  <img src={contentUrl(`${icon}`)} alt="" className="h-full w-full object-cover" />
</span>;

export default RacePortrait;
