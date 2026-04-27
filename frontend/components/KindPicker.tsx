"use client";

import { useEffect, useState } from "react";
import { parseIndex, OpenAPIIndex } from "@/lib/openapi";

export interface KindRef {
  group: string;
  version: string;
  kind: string;
  gv: string; // "apps/v1" or "v1"
}

// Popular core kinds we surface in the picker without forcing the admin to dig.
// Users can still select any GroupVersion manually.
const FEATURED: KindRef[] = [
  { group: "apps", version: "v1", gv: "apps/v1", kind: "Deployment" },
  { group: "apps", version: "v1", gv: "apps/v1", kind: "StatefulSet" },
  { group: "",     version: "v1", gv: "v1",      kind: "Service" },
  { group: "",     version: "v1", gv: "v1",      kind: "ConfigMap" },
  { group: "",     version: "v1", gv: "v1",      kind: "Secret" },
  { group: "batch", version: "v1", gv: "batch/v1", kind: "Job" },
  { group: "batch", version: "v1", gv: "batch/v1", kind: "CronJob" },
];

export function KindPicker({
  cluster, onPick,
}: {
  cluster: string;
  onPick: (k: KindRef) => void;
}) {
  const [gvs, setGvs] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/clusters/${encodeURIComponent(cluster)}/openapi`);
        if (!res.ok) throw new Error(`openapi index 조회 실패: ${res.status}`);
        const idx = await res.json() as OpenAPIIndex;
        setGvs(parseIndex(idx));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [cluster]);

  return (
    <div>
      <h3 className="font-semibold mb-2">빠른 선택</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        {FEATURED.map(k => (
          <button
            key={k.gv + "/" + k.kind}
            onClick={() => onPick(k)}
            className="px-3 py-1 border rounded hover:bg-muted text-sm"
          >
            {k.kind}
          </button>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-foreground">전체 GroupVersion 목록 ({gvs.length})</summary>
        <div className="mt-2 max-h-64 overflow-auto text-xs font-mono">
          {err && <div className="text-red-600">{err}</div>}
          {gvs.map(gv => (
            <div key={gv} className="py-0.5">{gv}</div>
          ))}
        </div>
      </details>
    </div>
  );
}
