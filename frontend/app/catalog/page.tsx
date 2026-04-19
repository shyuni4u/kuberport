import { apiFetch } from "@/lib/api-server";
import { CatalogBrowser } from "@/components/CatalogBrowser";
import type { CatalogCardTemplate } from "@/components/CatalogCard";

type ApiTemplate = {
  name: string;
  display_name: string;
  description: string | null;
  tags: string[] | null;
  current_version: number | null;
  current_status: string | null;
  owning_team_name?: string | null;
};

export default async function CatalogPage() {
  const data = await apiFetch("/v1/templates")
    .then((r) => (r.ok ? r.json() : { templates: [] }))
    .catch(() => ({ templates: [] }));

  const templates: CatalogCardTemplate[] = (data.templates as ApiTemplate[])
    .filter((t) => t.current_status === "published" && t.current_version != null)
    .map((t) => ({
      name: t.name,
      display_name: t.display_name,
      description: t.description,
      tags: t.tags ?? [],
      current_version: t.current_version!,
      owning_team_name: t.owning_team_name,
    }));

  return <CatalogBrowser templates={templates} />;
}
