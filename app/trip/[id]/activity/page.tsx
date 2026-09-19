import { redirect } from "next/navigation";

/** Activity demoted into the agent drawer — keep old links working. */
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/trip/${id}/plan`);
}
