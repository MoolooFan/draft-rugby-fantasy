import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { getServerProfile } from "@/lib/serverSession";
import { currentSeasonYear } from "@/lib/season";

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
  title: `Draft Fantasy ${currentSeasonYear()}`,
  description: "Super Rugby fantasy draft app",
  applicationName: `Draft Fantasy ${currentSeasonYear()}`,

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: `Draft Fantasy ${currentSeasonYear()}`,
  },

  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerProfile();
  const sessionProfile = profile
    ? {
        username: profile.username,
        displayName: profile.displayName,
        firstName: profile.firstName ?? undefined,
        lastName: profile.lastName ?? undefined,
        timezone: profile.timezone ?? undefined,
        isSiteAdmin: profile.isSiteAdmin || undefined,
      }
    : null;

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
        <SessionProvider profile={sessionProfile}>{children}</SessionProvider>

        {/* Portal target for modals / menus if needed later */}
        <div id="overlay-root" />
      </body>
    </html>
  );
}
