"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SchemaTree } from "@/components/SchemaTree";
import { FieldInspector, UIField } from "@/components/FieldInspector";
import { YamlPreview, UIModeTemplate } from "@/components/YamlPreview";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { MetaRow, TemplateMeta } from "@/components/editor/MetaRow";
import { BottomBar } from "@/components/editor/BottomBar";
import { YamlEditor } from "@/components/YamlEditor";
import { findKindSchema, OpenAPISchemaDoc, SchemaNode } from "@/lib/openapi";

// Next.js App Router requires useSearchParams callers to be wrapped in Suspense.
export default function EditUITemplateVersion() {
  return (
    <Suspense fallback={<div>로딩 중…</div>}>
      <EditUITemplateVersionInner />
    </Suspense>
  );
}

function EditUITemplateVersionInner() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "ui";
  if (mode === "yaml") {
    return <YamlModeEdit />;
  }
  return <UIModeEdit />;
}

type TemplateMetaFromAPI = {
  name: string;
  display_name: string;
  tags?: string[] | null;
};

function UIModeEdit() {
  const { name, v } = useParams<{ name: string; v: string }>();
  const router = useRouter();
  const [state, setState] = useState<UIModeTemplate | null>(null);
  const [schemas, setSchemas] = useState<Record<string, SchemaNode>>({});
  const [cluster, setCluster] = useState("");
  const [active, setActive] = useState<{ resIdx: number; path: string; node: SchemaNode } | null>(null);
  const [meta, setMeta] = useState<TemplateMeta>({ name: name ?? "", tags: [] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [vRes, tRes, cRes] = await Promise.all([
          fetch(`/api/v1/templates/${name}/versions/${v}`),
          fetch(`/api/v1/templates/${name}`),
          fetch("/api/v1/clusters"),
        ]);
        if (!vRes.ok) { setErr(await vRes.text()); return; }
        const ver = await vRes.json() as { authoring_mode: string; ui_state_json: UIModeTemplate };
        if (ver.authoring_mode !== "ui") {
          setErr("이 버전은 YAML 모드로 작성되어 UI 에디터에서 열 수 없습니다.");
          return;
        }
        setState(ver.ui_state_json);

        if (tRes.ok) {
          const t = await tRes.json() as TemplateMetaFromAPI;
          setMeta({
            name: t.name,
            display_name: t.display_name,
            tags: t.tags ?? [],
          });
        }

        if (cRes.ok) {
          const d = await cRes.json() as { clusters: Array<{ name: string }> };
          if (d.clusters[0]) setCluster(d.clusters[0].name);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
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

  const canSave = !!state && !saving;
  // Publish-from-editor is a later task; the BottomBar shell stays consistent
  // but the button is disabled here. Publishing still happens from the
  // template detail page.
  const canPublish = false;

  async function saveAsNewVersion() {
    setErr(null);
    if (!state) return;
    setSaving(true);
    try {
      // Only the version payload is persisted: POST /v1/templates/:name/versions
      // writes a new row into template_versions (ui_state_json, authoring_mode,
      // etc.). Parent-template metadata (display_name, tags) lives on the
      // `templates` row and has no update endpoint today, so MetaRow is rendered
      // read-only above — there is nothing to send here for those fields.
      const res = await fetch(`/api/v1/templates/${name}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authoring_mode: "ui", ui_state: state }),
      });
      if (!res.ok) { setErr(`${res.status}: ${await res.text()}`); return; }
      router.push(`/templates/${name}`);
    } finally {
      setSaving(false);
    }
  }

  if (err) return <div className="text-red-600 text-sm">{err}</div>;
  if (!state) return <div>로딩 중…</div>;

  const tree = (
    <div className="space-y-2">
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
  );

  const inspector = active ? (
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
  ) : (
    <div className="text-slate-500 text-sm">왼쪽 트리에서 필드를 선택하세요.</div>
  );

  const preview = (
    <div className="p-3">
      {uiStateSynthetic && <YamlPreview uiState={uiStateSynthetic} />}
    </div>
  );

  return (
    <div className="space-y-3">
      <MetaRow meta={meta} onChange={setMeta} nameLocked readOnly />
      <EditorLayout tree={tree} inspector={inspector} preview={preview} />
      {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      <BottomBar
        canSave={canSave}
        canPublish={canPublish}
        saving={saving}
        onSave={saveAsNewVersion}
        onPublish={() => {}}
      />
    </div>
  );
}

// ?mode=yaml fallback for the edit page. There is no existing YAML edit
// route for a specific version — YAML-authored versions surface their
// legacy "legacy YAML" badge on the template detail page and are not
// editable. For now we show a clear message rather than pretending the
// fallback does something useful.
function YamlModeEdit() {
  const { name, v } = useParams<{ name: string; v: string }>();
  const [resourcesYaml, setResourcesYaml] = useState("");
  const [uispecYaml, setUispecYaml] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/v1/templates/${name}/versions/${v}`);
      if (!res.ok) { setErr(await res.text()); return; }
      const ver = await res.json() as { resources_yaml?: string; ui_spec_yaml?: string };
      setResourcesYaml(ver.resources_yaml ?? "");
      setUispecYaml(ver.ui_spec_yaml ?? "");
      setLoaded(true);
    })();
  }, [name, v]);

  if (err) return <div className="text-red-600 text-sm">{err}</div>;
  if (!loaded) return <div>로딩 중…</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        YAML 모드는 읽기 전용입니다. 저장하려면 UI 모드로 새 버전을 생성하세요.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <YamlEditor label="resources.yaml" value={resourcesYaml} onChange={setResourcesYaml} />
        <YamlEditor label="ui-spec.yaml" value={uispecYaml} onChange={setUispecYaml} />
      </div>
    </div>
  );
}
