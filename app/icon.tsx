import { ImageResponse } from "next/og";
import { LOGO_COLORS, LOGO_GEOMETRY, LOGO_VIEWBOX } from "@/components/brand/logo-tokens";

export const contentType = "image/png";

// ImageResponse (satori) only understands flexbox div/span nodes, not raw
// SVG shape elements, so the keyhole is redrawn here as absolutely
// positioned divs instead of importing <Logo>. Geometry comes straight from
// logo-tokens — its circle/bar proportions were already tuned to stay
// legible at 16px, so no favicon-specific override is needed here.
export function generateImageMetadata() {
  return [
    { id: "small", size: { width: 16, height: 16 } },
    { id: "large", size: { width: 32, height: 32 } },
  ];
}

export default function Icon({ id }: { id: string }) {
  const size = id === "small" ? 16 : 32;
  const scale = size / LOGO_VIEWBOX;
  const { container, mark } = LOGO_COLORS.color;
  const { containerRx, circle, bar } = LOGO_GEOMETRY;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: container,
          borderRadius: containerRx * scale,
          position: "relative",
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: (circle.cx - circle.r) * scale,
            top: (circle.cy - circle.r) * scale,
            width: circle.r * 2 * scale,
            height: circle.r * 2 * scale,
            borderRadius: "50%",
            background: mark,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: (bar.cx - bar.width / 2) * scale,
            top: (bar.cy - bar.height / 2) * scale,
            width: bar.width * scale,
            height: bar.height * scale,
            borderRadius: bar.rx * scale,
            background: mark,
            display: "flex",
          }}
        />
      </div>
    ),
    { width: size, height: size }
  );
}
