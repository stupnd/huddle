"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, X } from "lucide-react";
import { activeAgents, agentById, workingAgents } from "@/lib/domain/select";
import { useNow } from "@/lib/hooks/useNow";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AgentMessage } from "@/components/agents/AgentMessage";
import { plural } from "@/lib/format";
import { useShell } from "./ShellProvider";

/**
 * The agent chat drawer. Ambient context, not a destination: no composer, because
 * the conversation happens in the group chat. Docked as a column on wide screens
 * when pinned; a sheet everywhere else. openDrawerAt(messageId) scrolls the feed
 * to that message and highlights it briefly.
 */
export function AgentDrawer() {
  const { drawerMode, drawerOpen, closeDrawer } = useShell();

  if (drawerMode === "docked") {
    return (
      <aside
        aria-label="agent chat"
        className="sticky top-0 hidden h-dvh w-(--width-drawer) shrink-0 flex-col border-l border-line bg-surface-1 xl:flex 2xl:w-(--width-drawer-wide)"
      >
        <DrawerBody />
      </aside>
    );
  }

  return (
    <Sheet open={drawerOpen} onOpenChange={(o) => !o && closeDrawer()} title="agent chat" description="what the agents have said, newest at the bottom">
      <DrawerBody />
    </Sheet>
  );
}

function DrawerBody() {
  const { snapshot, drawerMode, pinned, setPinned, closeDrawer, drawerTarget, clearDrawerTarget } = useShell();
  const now = useNow();
  const feedRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const live = useMemo(() => workingAgents(snapshot), [snapshot]);
  const roster = useMemo(() => activeAgents(snapshot), [snapshot]);

  // scroll to a targeted message, then let the highlight fade
  useEffect(() => {
    if (!drawerTarget) return;
    const el = feedRef.current?.querySelector<HTMLElement>(`#msg-${CSS.escape(drawerTarget)}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlight(drawerTarget);
    }
    clearDrawerTarget();
    const t = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [drawerTarget, clearDrawerTarget]);

  // open at the newest message; afterwards stay pinned to the bottom unless the reader has scrolled up
  const count = snapshot.messages.length;
  const mounted = useRef(false);
  useEffect(() => {
    const el = feedRef.current;
    if (!el || drawerTarget) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (!mounted.current || nearBottom) el.scrollTop = el.scrollHeight;
    mounted.current = true;
  }, [count, drawerTarget]);

  return (
    <>
      <header className="flex h-(--height-tabbar) shrink-0 items-center justify-between gap-1 border-b border-line px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="font-display text-display-sm text-ink">agent chat</h2>
          <span className="text-body-sm text-ink-3 figures">
            {live.length > 0 ? `${live.length} working` : `${plural(roster.length, "agent")} on the trip`}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="mr-1 hidden items-center xl:flex" aria-hidden>
            {roster.map((a, i) => (
              <AgentAvatar key={a.id} agent={a} size="xs" className={i > 0 ? "-ml-0.5 outline-2 outline-surface-1" : "outline-2 outline-surface-1"} />
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="quiet"
                size="icon-sm"
                className="hidden xl:inline-flex"
                aria-label={pinned ? "unpin chat" : "pin chat open"}
                aria-pressed={pinned}
                onClick={() => setPinned(!pinned)}
              >
                {pinned ? <PinOff /> : <Pin />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? "unpin, let it slide over" : "keep it open beside the plan"}</TooltipContent>
          </Tooltip>
          {drawerMode === "overlay" && (
            <Button variant="quiet" size="icon-sm" aria-label="close chat" onClick={closeDrawer}>
              <X />
            </Button>
          )}
        </div>
      </header>

      <div ref={feedRef} className="min-h-0 flex-1 overflow-y-auto px-1 py-1" aria-live="polite" aria-relevant="additions" aria-label="agent messages">
        {snapshot.messages.length === 0 ? (
          <EmptyFeed />
        ) : (
          <ol className="flex flex-col gap-0.5">
            {snapshot.messages.map((m) => {
              const agent = agentById(snapshot, m.agentId);
              if (!agent) return null;
              return (
                <li key={m.id}>
                  <AgentMessage message={m} agent={agent} now={now} highlighted={highlight === m.id} />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-2 py-1.5 text-body-sm text-ink-3">
        to talk to them, reply in the group chat. this is the record.
      </footer>
    </>
  );
}

function EmptyFeed() {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2 text-center">
      <p className="font-display text-display-sm text-ink">nothing said yet</p>
      <p className="text-body-sm text-ink-2">when the crew starts talking in the group chat, the agents show up here with what they found.</p>
    </div>
  );
}
