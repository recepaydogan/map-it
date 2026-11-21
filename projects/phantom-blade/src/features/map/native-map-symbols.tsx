import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { contentUrl } from "../../lib/content-url";
import paths from "./native-map-icons.json";

export type NativeMapSymbolName = keyof typeof paths;

/** Native textures also serve filter headings that expect an SVG component. */
const createNativeSymbol = (name: NativeMapSymbolName): LucideIcon => {
  const Symbol = forwardRef<SVGSVGElement, LucideProps>(({ size = 24, ...props }, ref) => <svg
    {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <image href={contentUrl(paths[name])} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
  </svg>);
  Symbol.displayName = `NativeMapSymbol:${name}`;
  return Symbol;
};
export const NATIVE_MAP_SYMBOLS = Object.fromEntries(
  (Object.keys(paths) as NativeMapSymbolName[]).map(name => [name, createNativeSymbol(name)]),
) as Record<NativeMapSymbolName, LucideIcon>;
