import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TV — Next 14 Days",
  description:
    "A rolling two-week grid of upcoming scripted TV premieres and Season 1 episodes, with a subscribable iCal feed.",
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
