import { createLucideIcon } from "lucide-react";

const EventEntranceIcon = createLucideIcon("event-entrance", [
  ["path", { d: "M4 21V10a8 8 0 0 1 16 0v11", key: "outer-gate" }],
  ["path", { d: "M2 21h20", key: "threshold" }],
  ["path", { d: "m12 8 1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5z", key: "event-spark" }],
]);

export default EventEntranceIcon;
