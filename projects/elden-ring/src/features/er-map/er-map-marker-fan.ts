import * as L from "leaflet";

/**
 * A "spider web" fan for pins that sit on top of each other.
 *
 * markercluster's own spiderfy can't do this job: its groups are per-category, so a
 * boss, an item and an enemy sharing one spot live in three different groups and
 * would never fan together — and merging the groups would cost the zoomed-out map
 * its per-category cluster bubbles. This fans by SCREEN PROXIMITY instead, so what
 * ends up in one web is exactly what looked like one blob to the user.
 *
 * The stacked pins are left exactly where they are and become the web's anchor; the
 * fan itself is drawn as separate CLONE markers on dedicated panes above the map.
 * That is deliberate: the real pins are children of a MarkerClusterGroup, which
 * listens for their `move` events and re-clusters on the spot — moving them out to
 * the fan positions would make the group fight the fan mid-open.
 */

// Pins are 32px, so 44px leaves a clear gap between fanned discs — both around a
// ring and between one ring and the next.
const FOOT_SEPARATION = 44;
// Far enough out that the first ring always clears the stack it grew from.
const MIN_LEG_LENGTH = 48;

const LEG_STYLE: L.PolylineOptions = {
  weight: 2,
  color: "#c7ad67",
  opacity: 0.9,
  interactive: false,
};

/**
 * The plate the whole web sits on. Dimming the pins around the web is not enough on
 * its own: a big web is still 20+ discs over a busy map, and the eye has nothing
 * telling it where the web ends and the map starts. Dropping a dark disc under it
 * gives the feet a background of their own, so they read as one deliberate object.
 *
 * INTERACTIVE, deliberately: it has to swallow the pointer, or the mouse falls
 * through to the dimmed pins underneath and their hover tooltips pop up through the
 * plate. Dismissal is preserved by the scrim's own click handler (open() wires it to
 * close); bubbling is off so that click is handled once, not again by the map.
 */
const SCRIM_STYLE: L.CircleMarkerOptions = {
  interactive: true,
  bubblingMouseEvents: false,
  color: "#c7ad67",
  weight: 1,
  opacity: 0.4,
  fillColor: "#07080d",
  fillOpacity: 0.84,
};

// Clears the outermost ring's discs (16px half-pin) with a little air to spare.
const SCRIM_MARGIN = 28;

const SCRIM_PANE = "erFanScrim";
const LEG_PANE = "erFanLeg";
const FAN_PANE = "erFan";
const FAN_TIP_PANE = "erFanTip";
// Above the marker pane (600) so the web always wins, below the player pin (680) —
// the "you are here" marker stays the one thing nothing covers. The clones' tooltips
// need their own pane too: Leaflet's default tooltip pane sits at 650, UNDER the fan
// pins, so a fanned pin's hover label would slide behind its neighbours.
const SCRIM_PANE_Z = 655;
const LEG_PANE_Z = 660;
const FAN_PANE_Z = 670;
const FAN_TIP_PANE_Z = 675;

const radiusOf = (ring: number) => MIN_LEG_LENGTH + (ring - 1) * FOOT_SEPARATION;
const capacityOf = (ring: number) =>
  Math.max(1, Math.floor((2 * Math.PI * radiusOf(ring)) / FOOT_SEPARATION));

/**
 * Lays the web out over CONCENTRIC RINGS, not the single circle markercluster uses.
 * A single ring has to grow its radius to fit its members, which is fine for a
 * handful and useless past that: the ER overworld has a spot holding 107 pins at one
 * exact coordinate (a merchant's stock), and one circle puts those 763px out — a web
 * bigger than the window. Rings grow with the square root of the count instead, so
 * that same pile lands inside ~270px and every pin stays reachable.
 */
const fanLayout = (count: number, center: L.Point): { points: L.Point[]; outerRadius: number } => {
  let rings = 1;
  for (let total = capacityOf(1); total < count; total += capacityOf(rings)) rings++;

  // Spread members across the rings in proportion to each one's circumference, so an
  // inner ring is never packed tight while the one outside it holds a lone pin.
  const weights = Array.from({ length: rings }, (_, index) => capacityOf(index + 1));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const perRing = weights.map((weight) => Math.floor((count * weight) / weightSum));
  const placed = () => perRing.reduce((sum, n) => sum + n, 0);
  for (let index = 0; placed() < count; index = (index + 1) % rings) perRing[index] += 1;

  const points: L.Point[] = [];
  perRing.forEach((n, index) => {
    const ring = index + 1;
    const radius = radiusOf(ring);
    const step = (2 * Math.PI) / n;
    // Every ring starts at 12 o'clock; even ones are nudged half a step round so
    // feet on neighbouring rings don't line up into spokes.
    const start = -Math.PI / 2 + (ring % 2 === 0 ? step / 2 : 0);
    for (let i = 0; i < n; i++) {
      const angle = start + i * step;
      points.push(
        L.point(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle)),
      );
    }
  });
  return { points, outerRadius: radiusOf(rings) };
};

export interface FanMember {
  id: string;
  icon: L.DivIcon;
  label: string;
}

export class MarkerFan {
  private readonly map: L.Map;
  private readonly onSelect: (id: string) => void;
  private readonly clones = new Map<string, L.Marker>();
  private legs: L.Polyline[] = [];
  private scrim: L.CircleMarker | null = null;
  private anchorId: string | null = null;

  constructor(map: L.Map, onSelect: (id: string) => void) {
    this.map = map;
    this.onSelect = onSelect;
    this.ensurePane(SCRIM_PANE, SCRIM_PANE_Z);
    this.ensurePane(LEG_PANE, LEG_PANE_Z);
    this.ensurePane(FAN_PANE, FAN_PANE_Z);
    this.ensurePane(FAN_TIP_PANE, FAN_TIP_PANE_Z);
    this.close = this.close.bind(this);
    // A click on open map = dismiss, same as markercluster. Leaflet only fires the
    // map's click when no interactive layer took it, so clicking a fanned pin (or the
    // stack under it) never reaches this.
    map.on("click", this.close);
    // Any zoom invalidates the geometry — the fan is laid out in screen pixels.
    map.on("zoomstart", this.close);
  }

  private ensurePane(name: string, zIndex: number) {
    const existing = this.map.getPane(name);
    const pane = existing ?? this.map.createPane(name);
    pane.style.zIndex = String(zIndex);
  }

  /** The pin the web grew from, or null when nothing is fanned. */
  get anchor(): string | null {
    return this.anchorId;
  }

  /** True while `id` is a pin in the open web — the anchor and every fanned foot. */
  hasMember(id: string): boolean {
    return this.clones.has(id);
  }

  open(anchorId: string, anchor: L.LatLng, members: FanMember[]) {
    this.close();
    const center = this.map.latLngToLayerPoint(anchor);
    const { points, outerRadius } = fanLayout(members.length, center);
    // circleMarker's radius is in SCREEN pixels and holds across zoom, which is the
    // same space the ring layout is computed in.
    this.scrim = L.circleMarker(anchor, {
      ...SCRIM_STYLE,
      pane: SCRIM_PANE,
      radius: outerRadius + SCRIM_MARGIN,
    }).addTo(this.map);
    // A click on the plate that misses every foot = dismiss, same as open map.
    this.scrim.on("click", this.close);
    members.forEach((member, index) => {
      const target = this.map.layerPointToLatLng(points[index]);
      this.legs.push(
        L.polyline([anchor, target], { ...LEG_STYLE, pane: LEG_PANE }).addTo(this.map),
      );
      // No `title` here, on purpose: Leaflet writes it onto the DOM as the HTML title
      // attribute, and the browser's own native tooltip then pops up NEXT TO the
      // Leaflet one on hover. The bound tooltip is the only label the clone needs.
      const clone = L.marker(target, {
        icon: member.icon,
        pane: FAN_PANE,
        alt: member.label,
      });
      clone.bindTooltip(member.label, {
        direction: "top",
        offset: [0, -4],
        className: "er-tooltip",
        pane: FAN_TIP_PANE,
      });
      clone.on("click", () => this.onSelect(member.id));
      clone.addTo(this.map);
      this.clones.set(member.id, clone);
    });
    this.anchorId = anchorId;
    // Drives the dim of every pin outside the web (see .er-fan-open in index.css).
    this.map.getContainer().classList.add("er-fan-open");
  }

  /** Keeps a fanned clone's icon in step with selection / favourite / found changes. */
  refreshIcon(id: string, icon: L.DivIcon, label?: string) {
    const clone = this.clones.get(id);
    clone?.setIcon(icon);
    if (clone && label) {
      clone.setTooltipContent(label);
      clone.getElement()?.setAttribute("aria-label", label);
    }
  }

  close() {
    if (!this.anchorId) return;
    for (const clone of this.clones.values()) clone.remove();
    for (const leg of this.legs) leg.remove();
    this.scrim?.remove();
    this.scrim = null;
    this.clones.clear();
    this.legs = [];
    this.anchorId = null;
    this.map.getContainer().classList.remove("er-fan-open");
  }

  destroy() {
    this.close();
    this.map.off("click", this.close);
    this.map.off("zoomstart", this.close);
  }
}
