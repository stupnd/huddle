"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TripSnapshot } from "@/lib/domain/types";
import { useBreakpoint } from "@/lib/hooks/useBreakpoint";
import { useLocalPref } from "@/lib/hooks/useLocalPref";
import { useLiveTrip } from "@/lib/hooks/useLiveTrip";

/**
 * Shell state: the trip snapshot plus everything the persistent chrome shares.
 *
 * Drawer modes
 *  - docked   wide screen and pinned: a column beside the content, always visible
 *  - overlay  everything else: slides over the content when open
 */

export type DrawerMode = "docked" | "overlay";

type ShellState = {
  snapshot: TripSnapshot;
  tripId: string;
  /** last polling error, null when the feed is healthy */
  liveError: string | null;
  /** re-read the trip now instead of waiting for the next poll */
  refresh: () => void;
  /** who is looking: picked once via WhoAreYou, remembered per browser */
  setViewer: (memberId: string) => void;
  /** true when a sign-in cookie was present; false means guest */
  signedIn: boolean;

  drawerOpen: boolean;
  drawerMode: DrawerMode;
  pinned: boolean;
  /** message the drawer should scroll to and highlight once open */
  drawerTarget: string | null;
  /** when the viewer last had the drawer open, for the unread count */
  drawerSeenAt: string | null;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setPinned: (pinned: boolean) => void;
  /** open the drawer scrolled to a message. used by provenance tags */
  openDrawerAt: (messageId: string) => void;
  clearDrawerTarget: () => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ initial, tripId, signedIn = false, children }: { initial: TripSnapshot; tripId: string; signedIn?: boolean; children: React.ReactNode }) {
  const { snapshot: live, error: liveError, refresh } = useLiveTrip(tripId, initial);
  const [viewer, setViewer] = useLocalPref<string>(`viewer:${tripId}`, "");
  const snapshot = useMemo(
    // The server-resolved identity (from the sign-in cookie) always wins over the remembered pick
    () => (initial.viewerId ? { ...live, viewerId: initial.viewerId }
      : viewer && live.members.some((m) => m.id === viewer) ? { ...live, viewerId: viewer } : live),
    [live, viewer],
  );
  const wide = useBreakpoint("xl");
  const [pinned, setPinned] = useLocalPref<boolean>(`drawer-pinned:${tripId}`, true);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  // everything present at first paint counts as seen; the badge is for what arrives while you look
  const [seenAt, setSeenAt] = useState<string | null>(initial.loadedAt);

  const drawerMode: DrawerMode = wide && pinned ? "docked" : "overlay";
  const drawerOpen = drawerMode === "docked" ? true : open;

  // leaving the docked mode (unpin, or window shrinks) should not pop an overlay open
  useEffect(() => {
    if (drawerMode === "overlay") setOpen(false);
  }, [drawerMode]);

  // anything visible counts as seen
  useEffect(() => {
    if (drawerOpen) setSeenAt(new Date().toISOString());
  }, [drawerOpen, snapshot.messages.length]);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => {
    if (drawerMode === "docked") {
      setPinned(false);
      return;
    }
    setOpen((o) => !o);
  }, [drawerMode, setPinned]);
  const openDrawerAt = useCallback((messageId: string) => {
    setTarget(messageId);
    setOpen(true);
  }, []);
  const clearDrawerTarget = useCallback(() => setTarget(null), []);

  const value = useMemo<ShellState>(
    () => ({
      snapshot,
      tripId,
      liveError,
      refresh,
      setViewer,
      signedIn,
      drawerOpen,
      drawerMode,
      pinned,
      drawerTarget: target,
      drawerSeenAt: seenAt,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      setPinned,
      openDrawerAt,
      clearDrawerTarget,
    }),
    [snapshot, tripId, liveError, refresh, setViewer, signedIn, drawerOpen, drawerMode, pinned, target, seenAt, openDrawer, closeDrawer, toggleDrawer, setPinned, openDrawerAt, clearDrawerTarget],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
}

/** shorthand for components that only read data */
export function useSnapshot() {
  return useShell().snapshot;
}
