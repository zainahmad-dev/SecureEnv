import { ImageResponse } from "next/og";
import { LOGO_COLORS, LOGO_GEOMETRY, LOGO_VIEWBOX } from "@/components/brand/logo-tokens";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same div-based redraw of the keyhole mark as app/icon.tsx — ImageResponse
// (satori) doesn't accept raw SVG shape elements, only flexbox div/span
// nodes. At 180px there's no need for the favicon's small-size circle bump.
export default function AppleIcon() {
  const scale = size.width / LOGO_VIEWBOX;
  const { container, mark } = LOGO_COLORS.color;
  const { containerRx, circle, bar } = LOGO_GEOMETRY;

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
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
    { ...size }
  );
}
