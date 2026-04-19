import { StatusChip, statusChipVariantFromRelease } from "@/components/StatusChip";
import { KubeTermsToggle } from "@/components/KubeTermsToggle";

export type ReleaseHeaderData = {
  id: string;
  name: string;
  status: string;
  template: { name: string; version: number };
  cluster: string;
  namespace: string;
  created_at?: string;
};

export function ReleaseHeader({ data }: { data: ReleaseHeaderData }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-xl font-medium">{data.name}</h1>
        <StatusChip variant={statusChipVariantFromRelease(data.status)}>
          {data.status}
        </StatusChip>
        <div className="ml-auto">
          <KubeTermsToggle />
        </div>
      </div>
      <div className="text-sm text-slate-600">
        {data.template.name} v{data.template.version} · {data.cluster} / {data.namespace}
        {data.created_at ? ` · ${new Date(data.created_at).toLocaleString()}` : ""}
      </div>
    </header>
  );
}
