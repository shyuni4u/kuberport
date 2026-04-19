import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { iconFor } from "@/lib/template-icons";

export type CatalogCardTemplate = {
  name: string;
  display_name: string;
  description: string | null;
  tags: string[];
  current_version: number;
  owning_team_name?: string | null;
};

type Props = { template: CatalogCardTemplate };

export function CatalogCard({ template }: Props) {
  const Icon = iconFor(template.tags);
  const teamLabel = template.owning_team_name ?? "—";
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-white p-4 shadow-sm hover:shadow transition">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium">{template.display_name}</h3>
      </div>
      <p className="text-xs text-slate-600 line-clamp-2 min-h-9">
        {template.description ?? ""}
      </p>
      <div className="flex flex-wrap gap-1">
        {template.tags.map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
        <span>v{template.current_version} · {teamLabel}</span>
        <Link
          href={`/catalog/${template.name}/deploy`}
          className="text-blue-700 hover:underline"
        >
          배포하기 →
        </Link>
      </div>
    </div>
  );
}
