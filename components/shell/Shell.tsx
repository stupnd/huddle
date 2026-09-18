"use client";
import type { TripSnapshot } from "@/lib/domain/types";
import { ShellProvider } from "./ShellProvider";
import { TopBar } from "./TopBar";
import { StatusStrip } from "./StatusStrip";
import { TabNav } from "./TabNav";
import { AgentDrawer } from "./AgentDrawer";
import { TabTransition } from "./TabTransition";

/**
 * The persistent shell around every tab: top bar, live status strip, primary
 * tabs, the content area, and the agent drawer beside or over it.
 *
 * Layout: a flex row. The content column flexes; the docked drawer is a fixed
 * width column on xl and up. Below xl the drawer is a sheet and takes no space.
 */
export function Shell({ initial, tripId, children }: { initial: TripSnapshot; tripId: string; children: React.ReactNode }) {
  return (
    <ShellProvider initial={initial} tripId={tripId}>
      <div className="flex min-h-dvh w-full">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <StatusStrip />
          <TabNav />
          <main id="content" className="mx-auto w-full max-w-(--container-shell) flex-1 px-2 py-3 md:px-4 md:py-4">
            <TabTransition>{children}</TabTransition>
          </main>
        </div>
        <AgentDrawer />
      </div>
    </ShellProvider>
  );
}
