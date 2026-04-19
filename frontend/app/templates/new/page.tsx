"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KindPicker, KindRef } from "@/components/KindPicker";
import { SchemaTree } from "@/components/SchemaTree";
import { FieldInspector, UIField } from "@/components/FieldInspector";
import { YamlPreview, UIModeTemplate } from "@/components/YamlPreview";
import { findKindSchema, OpenAPISchemaDoc, SchemaNode } from "@/lib/openapi";

interface EditedResource {
  gv: string;
  kind: string;
  name: string;          // metadata.name
  rootSchema: SchemaNode;
  fields: Record<string, UIField>;
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Array<{ name: string }>>([]);
  const [cluster, setCluster] = useState<string>("");
  const [resources, setResources] = useState<EditedResource[]>([]);
  const [active, setActive] = useState<{ resIdx: number; path: string; node: SchemaNode } | null>(null);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [owningTeamId, setOwningTeamId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [cRes, tRes] = await Promise.all([fetch("/api/v1/clusters"), fetch("/api/v1/teams")]);
      if (cRes.ok) {
        const d = await cRes.json() as { clusters: Array<{ name: string }> };
        setClusters(d.clusters);
        if (d.clusters[0]) setCluster(d.clusters[0].name);
      }
      if (tRes.ok) {
        const d = await tRes.json() as { teams: Array<{ id: string; name: string }> };
        setTeams(d.teams);
      }
    })();
  }, []);

  async function addKind(k: KindRef) {
    const res = await fetch(`/api/v1/clusters/${encodeURIComponent(cluster)}/openapi/${k.gv}`);
    if (!res.ok) { setErr(await res.text()); return; }
    const doc = await res.json() as OpenAPISchemaDoc;
    const schema = findKindSchema(doc, k.group, k.version, k.kind);
    if (!schema) { setErr(`스키마 없음: ${k.kind}`); return; }
    setResources(prev => [...prev, {
      gv: k.gv, kind: k.kind,
      name: `${k.kind.toLowerCase()}-${prev.length + 1}`,
      rootSchema: schema,
      fields: {},
    }]);
  }

  const uiState: UIModeTemplate = useMemo(() => ({
    resources: resources.map(r => ({
      apiVersion: r.gv.includes("/") ? r.gv : (r.gv === "v1" ? "v1" : r.gv),
      kind: r.kind,
      name: r.name,
      fields: r.fields as unknown as Record<string, unknown>,
    })),
  }), [resources]);

  async function save() {
    setErr(null);
    const res = await fetch("/api/v1/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name, display_name: displayName,
        authoring_mode: "ui",
        owning_team_id: owningTeamId || undefined,
        ui_state: uiState,
      }),
    });
    if (!res.ok) { setErr(`${res.status}: ${await res.text()}`); return; }
    router.push("/templates");
  }

  if (clusters.length === 0) return <div>클러스터가 등록되어 있지 않습니다. 먼저 클러스터를 등록하세요.</div>;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3 space-y-4">
        <div>
          <label className="block text-xs mb-1">스키마 클러스터</label>
          <select value={cluster} onChange={e => setCluster(e.target.value)} className="border rounded px-2 py-1 w-full">
            {clusters.map(c => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>
        <KindPicker cluster={cluster} onPick={addKind} />
        <hr />
        <div className="space-y-2">
          <h3 className="font-semibold">편집 중</h3>
          {resources.map((r, i) => (
            <div key={i} className="border rounded p-2">
              <input
                value={r.name}
                onChange={e => setResources(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                className="w-full border-b text-sm font-mono mb-2"
              />
              <div className="text-xs text-slate-500 mb-2">{r.gv} · {r.kind}</div>
              <SchemaTree
                schema={r.rootSchema}
                selectedPath={active?.resIdx === i ? active.path : null}
                onSelect={(p, n) => setActive({ resIdx: i, path: p, node: n })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-5">
        <h2 className="font-semibold mb-3">필드 상세</h2>
        {active ? (
          <FieldInspector
            path={active.path}
            node={active.node}
            value={resources[active.resIdx].fields[active.path]}
            onChange={v => setResources(prev => prev.map((r, i) => i === active.resIdx
              ? { ...r, fields: { ...r.fields, [active.path]: v } }
              : r
            ))}
            onClear={() => setResources(prev => prev.map((r, i) => {
              if (i !== active.resIdx) return r;
              const { [active.path]: _, ...rest } = r.fields;
              return { ...r, fields: rest };
            }))}
          />
        ) : (
          <div className="text-slate-500 text-sm">왼쪽 트리에서 필드를 선택하세요.</div>
        )}

        <h2 className="font-semibold mt-6 mb-3">메타데이터</h2>
        <div className="space-y-2 mb-4">
          <input placeholder="템플릿 이름 (slug)" value={name} onChange={e => setName(e.target.value)}
            className="border rounded px-2 py-1 w-full" />
          <input placeholder="표시 이름" value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="border rounded px-2 py-1 w-full" />
          <select value={owningTeamId} onChange={e => setOwningTeamId(e.target.value)} className="border rounded px-2 py-1 w-full">
            <option value="">(글로벌 — admin 전용)</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">저장 (draft v1)</button>
        {err && <div className="text-red-600 text-sm whitespace-pre mt-2">{err}</div>}
      </div>

      <div className="col-span-4">
        <h2 className="font-semibold mb-3">프리뷰</h2>
        <YamlPreview uiState={uiState} />
      </div>
    </div>
  );
}
