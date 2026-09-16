import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>Your group chat stays a group chat.</h1>
      <p>
        Huddle reads your trip planning chat, keeps track of what everyone wants, brings in agents when the group is stuck,
        and shows you where the plan stands.
      </p>
      <div className="links">
        <Link className="pill" href="/sim">Open the chat simulator</Link>
      </div>
    </main>
  );
}
