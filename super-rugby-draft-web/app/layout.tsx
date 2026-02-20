import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Viewport configuration
 * This is the CORRECT place for themeColor + iOS full-screen behaviour
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // ensures full-screen on iOS (no black bars)
  themeColor: "#0f172a",
};

/**
 * App metadata
 * Keep this minimal — Next.js is strict about where certain fields live
 */
export const metadata: Metadata = {
  title: "Draft Fantasy 2026",
  description: "Super Rugby fantasy draft app",
  applicationName: "Draft Fantasy 2026",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Draft Fantasy 2026",
  },

  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100svh",
          background: "#0f172a",
        }}
      >
        {children}

        {/* Portal target for modals / menus if needed later */}
        <div id="overlay-root" />
      </body>
    </html>
  );
}
