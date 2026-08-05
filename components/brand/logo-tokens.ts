export type LogoVariant = "color" | "mono" | "outline";

/**
 * Single source of truth for the keyhole mark's geometry and palette, shared
 * between the in-app <Logo> SVG (components/brand/Logo.tsx) and the
 * div-based renders used by app/icon.tsx and app/apple-icon.tsx — those two
 * go through next/og's ImageResponse, which only understands flexbox
 * div/span nodes, not raw <svg> shape elements, so they can't just import
 * the component itself.
 */
export const LOGO_VIEWBOX = 120;

// Circle radius 17 (up from 14) and bar height 20 (down from 24) — a bare
// 14/24 pairing reads as a single blob at 16px favicon size, so the circle
// was enlarged for legibility while the bar was shortened to keep a visible
// gap between the two shapes instead of them merging. cy values re-center
// the whole assembly (circle top at y=27 to bar bottom at y=93) on the
// container's true vertical center, y=60.
export const LOGO_GEOMETRY = {
  containerRx: 26,
  circle: { cx: 60, cy: 44, r: 17 },
  bar: { cx: 60, cy: 83, width: 32, height: 20, rx: 6 },
} as const;

export const OUTLINE_STROKE = "#14141B";

export const LOGO_COLORS: Record<LogoVariant, { container: string; mark: string }> = {
  color: { container: "#2F35B0", mark: "#F5F5FF" },
  mono: { container: "#14141B", mark: "#FFFFFF" },
  outline: { container: "none", mark: OUTLINE_STROKE },
};
