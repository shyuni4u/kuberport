import Link from "next/link";

export function TemplateCard({
  t,
}: {
  t: { name: string; display_name: string; description: string; current_version: number };
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-base font-bold">{t.display_name}</div>
        <span className="text-xs text-slate-500">v{t.current_version}</span>
      </div>
      <div className="text-sm text-slate-600 mb-3">{t.description}</div>
      <Link
        href={`/catalog/${t.name}/deploy`}
        className="inline-block w-full text-center py-1.5 bg-blue-600 text-white rounded text-sm"
      >
        배포
      </Link>
    </div>
  );
}
