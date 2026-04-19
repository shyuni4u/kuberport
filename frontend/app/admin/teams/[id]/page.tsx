import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [membersRes, teamsRes] = await Promise.all([
    apiFetch(`/v1/teams/${id}/members`),
    apiFetch(`/v1/teams`),
  ]);
  if (!membersRes.ok) throw new Error(await membersRes.text());
  if (!teamsRes.ok) throw new Error(await teamsRes.text());
  // Backend serializes pgtype.Text as a plain string (or null), not the
  // {String, Valid} envelope an earlier version of this type assumed.
  const { members } = await membersRes.json() as {
    members: Array<{ user_id: string; role: string; email: string | null; user_display_name: string | null }> | null;
  };
  const { teams } = await teamsRes.json() as { teams: Array<{ id: string; name: string }> };
  const team = teams.find(t => t.id === id);

  async function addMember(formData: FormData) {
    "use server";
    const res = await apiFetch(`/v1/teams/${id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        role: formData.get("role"),
      }),
    });
    if (!res.ok) throw new Error(`멤버 추가 실패: ${res.status} ${await res.text()}`);
    revalidatePath(`/admin/teams/${id}`);
  }

  async function removeMember(formData: FormData) {
    "use server";
    const uid = formData.get("user_id");
    const res = await apiFetch(`/v1/teams/${id}/members/${uid}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`멤버 삭제 실패: ${res.status} ${await res.text()}`);
    revalidatePath(`/admin/teams/${id}`);
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{team?.name ?? id}</h1>

      <h2 className="font-semibold mb-2">멤버</h2>
      <table className="w-full bg-white border rounded text-sm mb-6">
        <thead className="text-xs text-slate-500">
          <tr><th className="p-2 text-left">이메일</th><th className="p-2 text-left">역할</th><th className="p-2"></th></tr>
        </thead>
        <tbody>
          {(members ?? []).map(m => (
            <tr key={m.user_id} className="border-t">
              <td className="p-2">{m.email ?? m.user_id}</td>
              <td className="p-2">{m.role}</td>
              <td className="p-2">
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button className="text-red-600 text-sm">제거</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="font-semibold mb-2">새 멤버 추가</h2>
      <form action={addMember} className="flex gap-2">
        <input name="email" type="email" placeholder="이메일" required className="border rounded px-3 py-1.5" />
        <select name="role" className="border rounded px-3 py-1.5">
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button className="px-4 py-1.5 bg-blue-600 text-white rounded">추가</button>
      </form>
      <p className="text-xs text-slate-500 mt-2">대상 유저가 최소 한 번 이상 로그인한 적이 있어야 합니다.</p>
    </div>
  );
}
