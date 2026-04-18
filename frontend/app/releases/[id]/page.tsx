import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch } from "@/lib/api-server";

interface ReleaseDetail {
  id: string;
  name: string;
  status: string;
  template?: { name: string; version: number };
  cluster: string;
  namespace: string;
  instances_total: number;
  instances_ready: number;
  created_at: string;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded p-4">
      <div className="text-xs uppercase text-slate-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiFetch(`/v1/releases/${id}`);
  if (!res.ok) {
    return (
      <div className="text-red-600">
        릴리스를 불러올 수 없습니다 ({res.status})
      </div>
    );
  }
  const d: ReleaseDetail = await res.json();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold">{d.name}</h1>
        <StatusBadge status={d.status} />
        <span className="text-slate-500 text-sm">
          {d.template?.name}@v{d.template?.version}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card title="상태 요약">
          <div className="text-2xl font-bold">
            {d.instances_ready}/{d.instances_total} 준비됨
          </div>
        </Card>
        <Card title="클러스터">
          <div>
            {d.cluster} /{" "}
            <span className="font-mono">{d.namespace}</span>
          </div>
        </Card>
        <Card title="생성">
          <div className="text-sm text-slate-600">
            {new Date(d.created_at).toLocaleString()}
          </div>
        </Card>
      </div>
    </div>
  );
}
