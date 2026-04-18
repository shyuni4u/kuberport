import { ReleaseTable } from "@/components/ReleaseTable";
import { apiFetch } from "@/lib/api-server";

export default async function ReleasesPage() {
  const res = await apiFetch("/v1/releases");
  const d = res.ok ? await res.json() : { releases: [] };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">내 릴리스</h1>
      <ReleaseTable rows={d.releases ?? []} />
    </div>
  );
}
