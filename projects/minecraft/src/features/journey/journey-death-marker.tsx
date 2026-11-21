import { Skull } from "lucide-react";

/** Marks the final recorded position of a journey that ended in death. */
const JourneyDeathMarker = ({ x, y }: { x: number; y: number }) => (
  <g data-journey-death transform={`translate(${x} ${y})`}>
    <circle r="11" fill="var(--color-danger)" stroke="white" strokeWidth="2" />
    <Skull x={-7} y={-7} width={14} height={14} color="white" strokeWidth={2.2} aria-hidden="true" />
  </g>
);

export default JourneyDeathMarker;
