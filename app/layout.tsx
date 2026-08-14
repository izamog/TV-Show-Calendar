import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TV Show Calendar",
  description:
    "A rolling four-week calendar of upcoming scripted TV premieres and Season 1 episodes, with a subscribable iCal feed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
