import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { InspectorSubject } from "./inspector-controller.ts";
import type { MapPointImageSource } from "../map/map-point-icon.tsx";

export interface InspectorLink {
  key: string; subject: InspectorSubject; name: string; note?: string; image?: MapPointImageSource; quantity?: number;
  transaction?: Readonly<{
    inputs: readonly Readonly<{ name: string; image?: MapPointImageSource; quantity?: number | string }>[];
    outputs: readonly Readonly<{ name: string; image?: MapPointImageSource; quantity?: number | string }>[];
  }>;
}
export interface InspectorSection {
  key: string; title: string; links: readonly InspectorLink[]; groupTitle?: string; collapsed?: boolean; previewSize?: number;
  description?: string;
}
export interface InspectorPillSection { key: string; title: string; values: readonly string[] }
export interface InspectorFact { key: string; label: string; value: string; note?: string }
export interface InspectorGuideSection {
  key: string; title: string; description?: string; heroImage?: string;
  facts?: readonly InspectorFact[]; pillSections?: readonly InspectorPillSection[];
  sections?: readonly InspectorSection[]; body?: ReactNode;
}
export interface InspectorContent {
  name: string; category: string; contextLabel?: string; image?: MapPointImageSource;
  /** Multiple related item images can represent compound subjects such as trades. */
  iconImages?: readonly MapPointImageSource[];
  heroImage?: string; description?: string;
  fallbackIcon?: LucideIcon;
  pillSections?: readonly InspectorPillSection[];
  facts?: readonly InspectorFact[];
  /** Summary links rendered between primary and secondary controls. */
  summarySections?: readonly InspectorSection[];
  sections?: readonly InspectorSection[];
  /** Extra body uses the same scroll region; recipe layouts need not pretend to be item rows. */
  body?: ReactNode;
  /** Let recipe diagrams sit directly on the guide surface without a second card. */
  bodyUnframed?: boolean;
  /** Ordered sections for a continuous, scannable guide page. */
  guideSections?: readonly InspectorGuideSection[];
  combat?: ReactNode;
  /** Focused facts for entity guides, grouped by how a player uses them. */
  entityGuide?: Readonly<{
    behavior?: readonly InspectorFact[];
    combat?: readonly InspectorFact[];
    spawning?: readonly InspectorFact[];
  }>;
  /** Keep reference rows informational where opening another detail page is unwanted. */
  sectionLinksInteractive?: boolean;
  /** Secondary controls that belong after summary sections. */
  footer?: ReactNode;
}
