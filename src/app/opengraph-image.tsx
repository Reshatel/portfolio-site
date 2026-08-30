import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Maksym Ostapchuk — Frontend Developer";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf8f3",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#6b6558",
          }}
        >
          Portfolio
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 700,
              color: "#161513",
              lineHeight: 1.05,
            }}
          >
            Maksym Ostapchuk
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              color: "#c1652f",
              marginTop: 16,
            }}
          >
            Frontend Developer
          </div>
          <div
            style={{
              display: "flex",
              width: 320,
              height: 6,
              background: "#c1652f",
              borderRadius: 3,
              marginTop: 40,
            }}
          />
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#6b6558" }}>
          React · Next.js · TypeScript · GSAP · Three.js
        </div>
      </div>
    ),
    size,
  );
}
