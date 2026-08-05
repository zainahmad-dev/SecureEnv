import { LOGO_COLORS, LOGO_GEOMETRY, LOGO_VIEWBOX, OUTLINE_STROKE, type LogoVariant } from "./logo-tokens";

type LogoProps = {
  /** Rendered width/height in px — the icon is square. */
  size?: number;
  variant?: LogoVariant;
  className?: string;
};

/**
 * The keyhole brand mark: a circle over a rounded bar, echoing the app's own
 * masked-value redaction pill. See logo-tokens.ts for the shared geometry
 * and palette.
 */
export function Logo({ size = 32, variant = "color", className }: LogoProps) {
  const { container, mark } = LOGO_COLORS[variant];
  const { containerRx, circle, bar } = LOGO_GEOMETRY;
  const isOutline = variant === "outline";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {isOutline ? (
        <rect
          x={1}
          y={1}
          width={LOGO_VIEWBOX - 2}
          height={LOGO_VIEWBOX - 2}
          rx={containerRx - 1}
          fill="none"
          stroke={OUTLINE_STROKE}
          strokeWidth={2}
        />
      ) : (
        <rect x={0} y={0} width={LOGO_VIEWBOX} height={LOGO_VIEWBOX} rx={containerRx} fill={container} />
      )}
      <circle cx={circle.cx} cy={circle.cy} r={circle.r} fill={mark} />
      <rect
        x={bar.cx - bar.width / 2}
        y={bar.cy - bar.height / 2}
        width={bar.width}
        height={bar.height}
        rx={bar.rx}
        fill={mark}
      />
    </svg>
  );
}
