import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Phase 36: every page previously shared this exact literal title, with
  // no way to tell them apart from a browser tab or a screen reader's page
  // list (WCAG 2.4.2, Page Titled). The template lets each page.tsx set
  // just its own segment (`title: "Members"`) via `export const metadata`
  // or `generateMetadata()`; pages that don't override it still fall back
  // to this exact default, unchanged.
  title: { template: "%s · SecureEnv", default: "SecureEnv" },
  description: "The redaction ledger for team secrets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {/* Sets data-theme on <html> from localStorage before anything below
            paints — see lib/theme/constants.ts for why this has to be an
            inline, framework-independent script rather than a React effect
            (an effect would run after the first paint, causing the exact
            flash this exists to prevent). suppressHydrationWarning on both
            tags above because this script intentionally changes an attribute
            React's server-rendered markup didn't know about. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
