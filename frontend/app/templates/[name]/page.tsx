import Link from "next/link";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export default async function TemplateDetail({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const tRes = await apiFetch(`/v1/templates/${name}`);
  if (!tRes.ok) {
    throw new Error(`템플릿 조회 실패: ${tRes.status} ${await tRes.text()}`);
  }
  const t = await tRes.json();
  const vsRes = await apiFetch(`/v1/templates/${name}/versions`);
  if (!vsRes.ok) {
    throw new Error(`버전 조회 실패: ${vsRes.status} ${await vsRes.text()}`);
  }
  const vs = await vsRes.json();

  async function publish(formData: FormData) {
    "use server";
    const version = formData.get("version") as string;
    const res = await apiFetch(
      `/v1/templates/${name}/versions/${version}/publish`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`publish 실패: ${res.status} ${await res.text()}`);
    }
    revalidatePath(`/templates/${name}`);
  }

  return (
    <div>
      <h1 className="text-xl font-bold">{t.display_name}</h1>
      <p className="text-slate-600">{t.description}</p>
      <h2 className="mt-6 font-semibold">버전</h2>
      <ul className="space-y-2 mt-2">
        {vs.versions?.map(
          (v: { id: string; version: number; status: string }) => (
            <li key={v.id} className="flex items-center gap-3">
              <span>v{v.version}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${v.status === "published" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
              >
                {v.status}
              </span>
              {v.status === "draft" && (
                <form action={publish}>
                  <input type="hidden" name="version" value={v.version} />
                  <button className="text-blue-600 text-sm">Publish</button>
                </form>
              )}
            </li>
          ),
        )}
      </ul>
      <Link
        href={`/templates/${name}/edit`}
        className="text-blue-600 mt-4 inline-block"
      >
        편집
      </Link>
    </div>
  );
}
