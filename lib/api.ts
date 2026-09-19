/** Browser-side JSON fetch. Throws an Error whose message is the server's error text. */
export async function api<T = unknown>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && typeof window !== "undefined") {
    // Not signed in. Go sign in and come straight back to this page rather than showing a toast
    // the person then has to act on by hand. Every write route returns 401 the same way.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/signin?next=${next}`);
    // Keep the caller's promise pending while the page navigates away
    await new Promise(() => {});
  }
  if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
  return json;
}
