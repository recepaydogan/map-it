/**
 * Custom hover label for map markers, standing in for the native `title`
 * tooltip (which Windows renders as a tiny delayed system box that ignores
 * app theming). Meant to be a child of an already screen-constant-sized
 * marker so it renders at true pixel size regardless of map zoom.
 */
type MarkerTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

const tooltipPosition: Record<MarkerTooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-2.5 -translate-x-1/2',
  bottom: 'left-1/2 top-full mt-2.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2.5 -translate-y-1/2',
}

const pointerPosition: Record<MarkerTooltipPlacement, string> = {
  top: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2 border-r border-b',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 border-l border-t',
  left: 'left-full top-1/2 -translate-x-1/2 -translate-y-1/2 border-r border-t',
  right: 'right-full top-1/2 translate-x-1/2 -translate-y-1/2 border-l border-b',
}

export function MapMarkerTooltip({
  label,
  visible,
  placement = 'top',
}: {
  label: string
  visible: boolean
  placement?: MarkerTooltipPlacement
}) {
  if (!visible) return null
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] shadow-xl ${tooltipPosition[placement]}`}
    >
      {label}
      <div className={`absolute size-2 rotate-45 border-[var(--border-strong)] bg-[var(--surface)] ${pointerPosition[placement]}`} />
    </div>
  )
}

/**
 * Immediate themed tooltip for the compact overlay controls. The controls sit
 * against the right edge, so the label and its pointer deliberately open left.
 */
export function MapControlTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text)] opacity-0 shadow-xl transition-[opacity,transform] duration-100 group-hover/control:translate-x-0 group-hover/control:opacity-100 group-focus-visible/control:translate-x-0 group-focus-visible/control:opacity-100"
    >
      {label}
      <span className="absolute left-full top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-t border-[var(--border-strong)] bg-[var(--surface)]" aria-hidden="true" />
    </span>
  )
}
