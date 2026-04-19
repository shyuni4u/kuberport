import Link from "next/link";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export default async function AdminTeamsPage() {
  const res = await apiFetch("/v1/teams");
  if (!res.ok) throw new Error(`팀 조회 실패: ${res.status} ${await res.text()}`);
  const { teams } = await res.json() as { teams: Array<{id:string; name:string; display_name:{String:string;Valid:boolean}}> };

  async function createTeam(formData: FormData) {
    "use server";
    const res = await apiFetch("/v1/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        display_name: formData.get("display_name"),
      }),
    });
    if (!res.ok) throw new Error(`팀 생성 실패: ${res.status} ${await res.text()}`);
    revalidatePath("/admin/teams");
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">팀 관리</h1>
      <form action={createTeam} className="flex gap-2 mb-6">
        <input name="name" placeholder="slug (예: platform)" className="border rounded px-3 py-1.5" required />
        <input name="display_name" placeholder="표시 이름" className="border rounded px-3 py-1.5" />
        <button className="px-4 py-1.5 bg-blue-600 text-white rounded">새 팀</button>
      </form>
      <ul className="space-y-2">
        {teams.map(t => (
          <li key={t.id}>
            <Link href={`/admin/teams/${t.id}`} className="text-blue-600">
              {t.display_name?.Valid ? t.display_name.String : t.name}
            </Link>
            <span className="text-xs text-slate-500 ml-2">{t.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
