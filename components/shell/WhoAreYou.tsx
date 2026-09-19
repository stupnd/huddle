"use client";
import { usePathname } from "next/navigation";
import { useShell } from "./ShellProvider";

/**
 * Identity comes from the sign-in cookie, resolved on the server. A guest sees this once at the
 * top of the trip; tapping any control also sends them to sign in and straight back here.
 */
export function WhoAreYou() {
  const { snapshot, signedIn } = useShell();
  const pathname = usePathname();
  if (snapshot.viewerId) return null;
  const next = encodeURIComponent(pathname ?? "/trips");

  return (
    <div className="mx-auto w-full max-w-(--container-shell) px-2 md:px-4">
      <div role="status" className="flex flex-col gap-1 rounded-xl border border-accent/30 bg-accent-soft/40 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <p className="text-body-sm text-ink">
          {signedIn ? (
            <>
              <span className="font-medium">you're not in this trip.</span>
              <span className="text-ink-2"> you can look, but only people in the chat can vote or edit.</span>
            </>
          ) : (
            <>
              <span className="font-medium">you're looking as a guest.</span>
              <span className="text-ink-2"> sign in with your number to vote and edit. huddle texts you a code.</span>
            </>
          )}
        </p>
        {!signedIn && (
          <a href={`/signin?next=${next}`} className="shrink-0 rounded-full bg-accent px-2 py-1 text-center text-body-sm font-medium text-ink-inverse">
            sign in
          </a>
        )}
      </div>
    </div>
  );
}
