"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SchemaTree } from "@/components/SchemaTree";
import { FieldInspector, UIField } from "@/components/FieldInspector";
import { YamlPreview, UIModeTemplate } from "@/components/YamlPreview";
import { findKindSchema, OpenAPISchemaDoc, SchemaNode } from "@/lib/openapi";

export default function EditUITemplateVersion() {
  const { name, v } = useParams<{ name: string; v: string }>();
  const router = useRouter();
  const [state, setState] = useState<UIModeTemplate | null>(null);
  const [schemas, setSchemas] = useState<Record<string, SchemaNode>>({});
  const [cluster, setCluster] = useState("");
  const [active, setActive] = useState<{ resIdx: number; path: string; node: SchemaNode } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const vRes = await fetch(`/api/v1/templates/${name}/versions/${v}`);
      if (!vRes.ok) { setErr(await vRes.text()); return; }
      const ver = await vRes.json() as { authoring_mode: string; ui_state_json: UIModeTemplate };
      if (ver.authoring_mode !== "ui") {
        setErr("이 버전은 YAML 모드로 작성되어 UI 에디터에서 열 수 없습니다.");
        return;
      }
      setState(ver.ui_state_json);

      const cRes = await fetch("/api/v1/clusters");
      if (cRes.ok) {
        const d = await cRes.json() as { clusters: Array<{ name: string }> };
        if (d.clusters[0]) setCluster(d.clusters[0].name);
      }
    })();
  }, [name, v]);

  useEffect(() => {
    if (!state || !cluster) return;
    (async () => {
      const out: Record<string, SchemaNode> = { ...schemas };
      for (const r of state.resources) {
        const key = `${r.apiVersion}/${r.kind}`;
        if (out[key]) continue;
        const gv = r.apiVersion;
        const res = await fetch(`/api/v1/clusters/${encodeURIComponent(cluster)}/openapi/${gv}`);
        if (!res.ok) continue;
        const doc = await res.json() as OpenAPISchemaDoc;
        const [group, version] = gv.includes("/") ? gv.split("/") : ["", gv];
        const s = findKindSchema(doc, group, version, r.kind);
        if (s) out[key] = s;
      }
      setSchemas(out);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cluster]);

  const uiStateSynthetic = useMemo<UIModeTemplate | null>(() => state, [state]);

  async function saveAsNewVersion() {
    setErr(null);
    if (!state) return;
    const res = await fetch(`/api/v1/templates/${name}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authoring_mode: "ui", ui_state: state }),
    });
    if (!res.ok) { setErr(`${res.status}: ${await res.text()}`); return; }
    router.push(`/templates/${name}`);
  }

  if (err) return <div className="text-red-600 text-sm">{err}</div>;
  if (!state) return <div>로딩 중…</div>;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <h2 className="font-semibold mb-2">편집 중 ({name} v{v})</h2>
        {state.resources.map((r, i) => {
          const s = schemas[`${r.apiVersion}/${r.kind}`];
          return (
            <div key={i} className="border rounded p-2 mb-2">
              <div className="text-xs text-slate-500 mb-1">{r.apiVersion} · {r.kind} · {r.name}</div>
              {s ? <SchemaTree
                schema={s}
                selectedPath={active?.resIdx === i ? active.path : null}
                onSelect={(p, n) => setActive({ resIdx: i, path: p, node: n })}
                fields={r.fields as Record<string, { mode: "fixed" | "exposed" }>}
              /> : <div className="text-xs text-slate-400">스키마 로딩 중…</div>}
            </div>
          );
        })}
      </div>
      <div className="col-span-5">
        {active && (
          <FieldInspector
            path={active.path}
            node={active.node}
            value={state.resources[active.resIdx].fields[active.path] as UIField | undefined}
            onChange={newVal => setState(prev => prev ? ({
              ...prev,
              resources: prev.resources.map((r, i) => i === active.resIdx
                ? { ...r, fields: { ...r.fields, [active.path]: newVal as unknown } }
                : r
  ),
            }) : prev)}
            onClear={() => setState(prev => prev ? ({
              ...prev,
              resources: prev.resources.map((r, i) => {
                if (i !== active.resIdx) return r;
                const { [active.path]: _, ...rest } = r.fields;
                return { ...r, fields: rest };
              }),
            }) : prev)}
          />
        )}
        <button onClick={saveAsNewVersion} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">새 버전으로 저장 (draft)</button>
        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      </div>
      <div className="col-span-4">
        {uiStateSynthetic && <YamlPreview uiState={uiStateSynthetic} />}
      </div>
    </div>
  );
}
