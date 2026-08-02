"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ToastProvider } from "@/components/toast/ToastProvider";
import type { SidebarData } from "@/lib/shell/sidebar-data";

type AppShellProps = {
  children: React.ReactNode;
  breadcrumb?: string[];
  sidebar: SidebarData;
  /**
   * The CSS custom property name (e.g. "--accent-dev") holding the current
   * environment's accent colour — only passed by pages scoped to a specific
   * environment (Phase 19). Sets --env-accent once at the root so the colour
   * band below and Sidebar's status dot can both just inherit it, rather
   * than each re-deriving "which of the three colours" independently.
   */
  envAccentVar?: string;
};

const DEFAULT_BREADCRUMB = ["Overview"];

export function AppShell({
  children,
  breadcrumb = DEFAULT_BREADCRUMB,
  sidebar,
  envAccentVar,
}: AppShellProps) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  // Same one-liner Sidebar already uses to resolve "which of my teams is
  // the current one" — GlobalSearch needs the slug too, to build result links.
  const currentTeam = sidebar.teams.find((team) => team.id === sidebar.currentTeamId) ?? null;

  // Only active while the drawer is open, so keyboard behaviour elsewhere in
  // the app is untouched. On mobile the drawer is the one true modal-ish
  // overlay in this app (a backdrop blocks the rest of the page) — Phase 36
  // treats it like a dialog: focus moves in on open, Tab/Shift+Tab cycle
  // only through the drawer's own controls (plus the backdrop's own "Close
  // sidebar" button, the last stop in the cycle) rather than leaking into
  // the content behind it, Escape closes it, and focus returns to the menu
  // button on close so a keyboard user doesn't lose their place.
  useEffect(() => {
    if (!isDrawerOpen) return;

    const drawer = document.getElementById("app-sidebar");
    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function getFocusable(): HTMLElement[] {
      const inDrawer = drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
      const backdrop = document.querySelector<HTMLElement>('[aria-label="Close sidebar"]');
      return backdrop ? [...inDrawer, backdrop] : inDrawer;
    }

    getFocusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);

      if (event.shiftKey ? activeIndex <= 0 : activeIndex === items.length - 1 || activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]')?.focus();
    };
  }, [isDrawerOpen]);

  return (
    <ToastProvider>
      <div
        className="flex min-h-screen flex-col bg-paper"
        style={
          envAccentVar
            ? ({ "--env-accent": `var(${envAccentVar})` } as React.CSSProperties)
            : undefined
        }
      >
        {/* First focusable element on every page — a keyboard user
            shouldn't have to tab through the sidebar's ~15 links on every
            single navigation just to reach the actual content. Invisible
            until it receives focus (WCAG 2.4.1 Bypass Blocks). */}
        <a
          href="#main-content"
          className="sr-only rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Skip to main content
        </a>

        {/* Not decoration — this is the product's core safety promise made
            visible: which of dev/staging/production you're looking at should
            never be something you have to check. */}
        {envAccentVar && (
          <div aria-hidden="true" className="h-1 w-full shrink-0 bg-[var(--env-accent)]" />
        )}

        <div className="flex min-h-0 flex-1">
          <Sidebar isOpen={isDrawerOpen} data={sidebar} envAccentVar={envAccentVar} />

          {isDrawerOpen && (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset min-[900px]:hidden"
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              isDrawerOpen={isDrawerOpen}
              onMenuClick={() => setDrawerOpen(true)}
              breadcrumb={breadcrumb}
              teamId={sidebar.currentTeamId}
              teamSlug={currentTeam?.slug ?? null}
            />
            {/* tabIndex={-1}: a fragment link scrolls to a target regardless,
                but only a focusable one actually receives keyboard focus —
                without this the skip link would visually jump the page but
                leave focus (and the next Tab stop) stuck on the link itself. */}
            <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 min-[900px]:px-8 focus:outline-none">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
