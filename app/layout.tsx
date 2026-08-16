import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
// The token layer must land before the utilities that reference it. It is
// imported here rather than @import-ed from globals.css because this project's
// PostCSS chain has no postcss-import to inline it with.
import "../tokens.css";
import "./globals.css";

/**
 * Three faces, the 2+1 ceiling: a roman serif for display, a workhorse sans for
 * body, and a mono confined to two roles — the data chips on an episode card
 * (air time, season/episode code, rating) and the colophon.
 *
 * All three are self-hosted by next/font, so no request leaves for a font CDN
 * and the fallback metrics are matched to avoid layout shift.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  // 400 body, 600 for the small-caps labels. A 200-unit gap is emphasis; the
  // 300-unit heading contrast is carried by Newsreader instead.
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "TV Show Calendar",
  description:
    "A rolling four-week calendar of new scripted TV premieres and favourited shows, with a subscribable iCal feed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The colophon sits at the bottom edge; viewport-fit + the safe-area padding
  // in globals keeps it clear of the iOS home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
