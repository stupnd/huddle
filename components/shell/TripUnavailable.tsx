import Link from "next/link";
import { Button } from "@/components/ui/button";

/** the trip could not be read: the message names what to fix, never "no data" */
export function TripUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--container-reading) flex-col justify-center gap-2 px-2 md:px-4">
      <h1 className="font-display text-display-lg text-ink">could not open this trip</h1>
      <p className="text-body text-ink-2">{message}</p>
      <div>
        <Button asChild variant="secondary">
          <Link href="/">back to your trips</Link>
        </Button>
      </div>
    </main>
  );
}
