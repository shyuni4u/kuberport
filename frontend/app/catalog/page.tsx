import Link from "next/link";
import { apiFetch } from "@/lib/api-server";

interface TemplateRow {
  name: string;
  display_name: string;
  description: { String: string; Valid: boolean };
  current_version: { Int32: number; Valid: boolean };
  // Plan 2 additions (backend returns these via ListTemplates join): current_status may be
  // absent for legacy rows; treat missing as "unknown" and include.
  current_status?: { String: string; Valid: boolean };
}

export default async function CatalogPage() {
  const res = await apiFetch("/v1/templates");
  if (!res.ok) throw new Error(await res.text());
  const { templates } = await res.json() as { templates: TemplateRow[] };

  const visible = templates.filter(t => !(t.current_status?.Valid && t.current_status.String === "deprecated"));

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">카탈로그</h1>
      <div className="grid grid-cols-3 gap-4">
        {visible.map(t => (
          <div key={t.name} className="bg-white border rounded p-4">
            <div className="font-semibold">{t.display_name}</div>
            <div className="text-sm text-slate-600 mb-2">
              {t.description?.Valid ? t.description.String : ""}
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {t.current_version?.Valid ? `v${t.current_version.Int32}` : "아직 publish 안 됨"}
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
