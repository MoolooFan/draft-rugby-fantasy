import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { getServerProfile } from "@/lib/serverSession";
import { currentSeasonYear } from "@/lib/season";
import ScoringRulesSync from "@/components/ScoringRulesSync";
import LeagueSync from "@/components/LeagueSync";
import ChatNotifier from "@/components/ChatNotifier";
import { PlayerCompareHost } from "@/components/PlayerCompare";
import { demo, demoClockSource } from "@/lib/demo";

/**
 * Viewport configuration
 * This is the CORRECT place for themeColor + iOS full-screen behaviour
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // stops iPhones zooming in when a text box is tapped (Ethan, 19 Nov 2026)
  maximumScale: 1,
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

  // demo site (lib/demo.ts): freeze the browser's clock before anything else runs, and say so
  const d = demo();
  return (
    <html lang="en">
      {d ? (
        <head>
          <script dangerouslySetInnerHTML={{ __html: `window.__SR_DEMO__=true;${demoClockSource(d.now)}` }} />
        </head>
      ) : null}
      <body
        style={{
          margin: 0,
          padding: 0,
          // keep everything below the iPhone clock/battery when opened from the home screen
          // (0 in a normal browser tab); the background comes from <html> (app/globals.css)
          // a little less than the full clock area (pages have their own top padding too)
          paddingTop: "max(0px, calc(env(safe-area-inset-top, 0px) - 10px))",
          minHeight: "100svh",
          background: "transparent",
        }}
      >
        {d ? (
          <div style={{ position: "sticky", top: 0, zIndex: 9000, background: "#f59e0b", color: "#0f172a", fontSize: 11, fontWeight: 900, textAlign: "center", padding: "4px 8px" }}>
            {d.label}
          </div>
        ) : null}
        <SessionProvider profile={sessionProfile}>
          <LeagueSync username={sessionProfile?.username ?? null} />
          {sessionProfile ? <ChatNotifier /> : null}
          <ScoringRulesSync>
            {children}
            {/* compare two players, from any page (player card Compare button, Stats Hub) */}
            {sessionProfile ? <PlayerCompareHost /> : null}
          </ScoringRulesSync>
        </SessionProvider>

        {/* Portal target for modals / menus if needed later */}
        <div id="overlay-root" />
      </body>
    </html>
  );
}
