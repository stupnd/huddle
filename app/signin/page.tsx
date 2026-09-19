import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignInForm } from "@/components/auth/SignInForm";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect(next?.startsWith("/") ? next : "/trips");
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-(--container-reading) flex-col justify-center gap-6 px-2 py-8 md:px-4">
      <ThemeToggle className="absolute top-2 right-2" />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-xl text-ink">sign in</h1>
        <p className="max-w-[34em] text-body text-ink-2">huddle will text you a code from the same number you plan with. no password, nothing to remember.</p>
      </div>
      <SignInForm next={next?.startsWith("/") ? next : "/trips"} />
    </main>
  );
}
