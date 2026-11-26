import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";
import SessionProvider from "@/components/SessionProvider";
import { getServerProfile } from "@/lib/serverSession";
import { currentSeasonYear } from "@/lib/season";
import ScoringRulesSync from "@/components/ScoringRulesSync";
import LeagueSync from "@/components/LeagueSync";
import ChatNotifier from "@/components/ChatNotifier";
import { PlayerCompareHost } from "@/components/PlayerCompare";
import { TeamProfileHost } from "@/components/TeamProfileModal";
import { LeagueStakesPrompt } from "@/components/LeagueStakes";
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
    // a solid status bar (Ethan, 26 Nov 2026): with "black-translucent" the page is drawn under
    // the clock and iOS 26.1+ blurs the top of it, which a page can't turn off. "default" starts
    // the page below the clock (it takes the dark themeColor). Saved when the app is added to the
    // Home Screen: remove it and add it again to see the change.
    statusBarStyle: "default",
    title: `Draft Fantasy ${currentSeasonYear()}`,
  },

  manifest: "/manifest.webmanifest",
};

// Fonts (design refresh, 18 Nov 2026): Barlow for text, Barlow Condensed for scores and points.
// The font files are in app/fonts (Barlow is free to use and share, SIL Open Font Licence), so
// the site doesn't depend on Google Fonts when it's built.
const barlow = localFont({
  src: [
    { path: "./fonts/Barlow-Regular.woff2", weight: "400" },
    { path: "./fonts/Barlow-Medium.woff2", weight: "500" },
    { path: "./fonts/Barlow-SemiBold.woff2", weight: "600" },
    { path: "./fonts/Barlow-Bold.woff2", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-Medium.woff2", weight: "500" },
    { path: "./fonts/BarlowCondensed-SemiBold.woff2", weight: "600" },
    { path: "./fonts/BarlowCondensed-Bold.woff2", weight: "700" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});

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
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
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
          <div style={{ position: "sticky", top: 0, zIndex: 9000, background: "#f59e0b", color: "#0f172a", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "4px 8px" }}>
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
            {/* a team's profile, tapping a team on the standings / power rankings / dashboard / matchup */}
            {sessionProfile ? <TeamProfileHost /> : null}
            {/* league rewards / punishments: "I agree" until each league mate has */}
            {sessionProfile ? <LeagueStakesPrompt /> : null}
          </ScoringRulesSync>
        </SessionProvider>

        {/* Portal target for modals / menus if needed later */}
        <div id="overlay-root" />
      </body>
    </html>
  );
}
