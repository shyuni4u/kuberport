import Link from "next/link";
import { apiFetch } from "@/lib/api-server";

// Backend serializes pgtype.Text/Int4 as plain values (or null), not the
// {String, Valid} / {Int32, Valid} envelopes an earlier version of these
// types assumed.
interface TemplateRow {
  name: string;
  display_name: string;
  description: string | null;
  current_version: number | null;
  current_status?: string | null;
}

export default async function CatalogPage() {
  const res = await apiFetch("/v1/templates");
  if (!res.ok) throw new Error(await res.text());
  const { templates } = await res.json() as { templates: TemplateRow[] };

  const visible = templates.filter(t => t.current_status !== "deprecated");

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">카탈로그</h1>
      <div className="grid grid-cols-3 gap-4">
        {visible.map(t => (
          <div key={t.name} className="bg-white border rounded p-4">
            <div className="font-semibold">{t.display_name}</div>
            <div className="text-sm text-slate-600 mb-2">
              {t.description ?? ""}
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {t.current_version != null ? `v${t.current_version}` : "아직 publish 안 됨"}
            </div>
            <Link href={`/catalog/${t.name}/deploy`} className="text-blue-600 text-sm">
              배포
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
