import { apiFetch } from "@/lib/api-server";
import { ReleaseHeader, type ReleaseHeaderData } from "@/components/ReleaseHeader";
import { ReleaseTabs } from "@/components/ReleaseTabs";
import { notFound } from "next/navigation";

export default async function ReleaseDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiFetch(`/v1/releases/${id}`);
  if (!res.ok) notFound();
  const data = (await res.json()) as ReleaseHeaderData;

  return (
    <div className="flex flex-col gap-4">
      <ReleaseHeader data={data} />
      <ReleaseTabs releaseId={id} />
      {children}
    </div>
  );
}
