"use client";
import type { TripSnapshot } from "@/lib/domain/types";
import { ShellProvider } from "./ShellProvider";
import { TopBar } from "./TopBar";
import { StatusStrip } from "./StatusStrip";
import { TabNav } from "./TabNav";
import { WhoAreYou } from "./WhoAreYou";
import { AgentDrawer } from "./AgentDrawer";
import { TabTransition } from "./TabTransition";

/**
 * Persistent chrome: top bar, live status (only when agents are working), three
 * primary tabs, identity pick, content, and the read-only agent drawer.
 */
export function Shell({ initial, tripId, signedIn, children }: { initial: TripSnapshot; tripId: string; signedIn: boolean; children: React.ReactNode }) {
  return (
    <ShellProvider initial={initial} tripId={tripId} signedIn={signedIn}>
      <div className="flex min-h-dvh w-full">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <StatusStrip />
          <TabNav />
          <div className="pt-1.5">
            <WhoAreYou />
          </div>
          <main id="content" className="mx-auto w-full max-w-(--container-shell) flex-1 px-2 py-3 md:px-4 md:py-4">
            <TabTransition>{children}</TabTransition>
          </main>
        </div>
        <AgentDrawer />
      </div>
    </ShellProvider>
  );
}
