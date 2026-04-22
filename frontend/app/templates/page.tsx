import Link from "next/link";
import { apiFetch } from "@/lib/api-server";

export default async function TemplatesPage() {
  const res = await apiFetch("/v1/templates");
  const data = res.ok ? await res.json() : { templates: [] };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">템플릿</h1>
        <Link
          href="/templates/new"
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
        >
          + 새 템플릿
        </Link>
      </div>
      <table className="w-full bg-white border rounded">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="p-2 text-left">이름</th>
            <th className="p-2 text-left">현재 버전</th>
            <th className="p-2 text-left">설명</th>
          </tr>
        </thead>
        <tbody>
          {data.templates?.map((t: Record<string, string | number>) => (
            <tr key={t.name} className="border-t">
              <td className="p-2">
                <Link
                  href={`/templates/${t.name}`}
                  className="text-blue-600"
                >
                  {t.display_name}
                </Link>
              </td>
              <td className="p-2">v{t.current_version ?? "—"}</td>
              <td className="p-2 text-slate-600">{t.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
