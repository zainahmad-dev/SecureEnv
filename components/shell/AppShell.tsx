"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import type { SidebarData } from "@/lib/shell/sidebar-data";

type AppShellProps = {
  children: React.ReactNode;
  breadcrumb?: string[];
  sidebar: SidebarData;
};

const DEFAULT_BREADCRUMB = ["Overview"];

export function AppShell({ children, breadcrumb = DEFAULT_BREADCRUMB, sidebar }: AppShellProps) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  // Only listen while the drawer is open, so Escape elsewhere in the app is untouched.
  useEffect(() => {
    if (!isDrawerOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar isOpen={isDrawerOpen} data={sidebar} />

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
        />
        <main className="flex-1 px-4 py-6 min-[900px]:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
