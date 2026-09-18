import { redirect } from "next/navigation";

/** /trip/[id] lands on the plan tab */
export default async function TripIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/trip/${id}/plan`);
}
