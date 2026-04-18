import { TemplateCard } from "@/components/TemplateCard";
import { apiFetch } from "@/lib/api-server";

export default async function CatalogPage() {
  const d = await apiFetch("/v1/templates")
    .then((r) => r.json())
    .catch(() => ({ templates: [] }));
  const published = (d.templates ?? []).filter(
    (t: { current_version?: number }) => t.current_version,
  );

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">카탈로그</h1>
      <div className="grid grid-cols-3 gap-4">
        {published.map(
          (t: { name: string; display_name: string; description: string; current_version: number }) => (
            <TemplateCard key={t.name} t={t} />
          ),
        )}
      </div>
    </div>
  );
}
