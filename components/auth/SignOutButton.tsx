"use client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button type="button" className="underline decoration-line-strong underline-offset-2 hover:text-ink"
      onClick={async () => { await fetch("/api/auth/signout", { method: "POST" }); router.push("/"); router.refresh(); }}>
      sign out
    </button>
  );
}
