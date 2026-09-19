import { redirect } from "next/navigation";

/** Money folded into Plan — keep old links working. */
export default async function MoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/trip/${id}/plan`);
}
