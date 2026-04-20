"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KindPicker, KindRef } from "@/components/KindPicker";
import { SchemaTree } from "@/components/SchemaTree";
import { FieldInspector, UIField } from "@/components/FieldInspector";
import { YamlPreview, UIModeTemplate } from "@/components/YamlPreview";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { MetaRow, TemplateMeta } from "@/components/editor/MetaRow";
import { BottomBar } from "@/components/editor/BottomBar";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { findKindSchema, OpenAPISchemaDoc, SchemaNode } from "@/lib/openapi";

type Team = { id: string; name: string };

// Sentinel used by the team <Select>. shadcn's Select disallows value="" on
// SelectItem (base-ui rejects empty strings), so the "global" option uses
// this placeholder and is mapped back to "" when submitted.
const GLOBAL_TEAM = "__global__";

interface EditedResource {
  gv: string;
  kind: string;
  name: string;          // metadata.name
  rootSchema: SchemaNode;
  fields: Record<string, UIField>;
}

// useSearchParams requires a Suspense boundary in App Router.
export default function NewTemplatePage() {
  return (
    <Suspense fallback={<div>로딩 중…</div>}>
      <NewTemplatePageInner />
    </Suspense>
  );
}

function NewTemplatePageInner() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "ui";
  if (mode === "yaml") {
    return <YamlModeNew />;
  }
  return <UIModeNew />;
}

function UIModeNew() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Array<{ name: string }>>([]);
  const [cluster, setCluster] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [owningTeamId, setOwningTeamId] = useState<string>("");
  const [resources, setResources] = useState<EditedResource[]>([]);
  const [active, setActive] = useState<{ resIdx: number; path: string; node: SchemaNode } | null>(null);
  const [meta, setMeta] = useState<TemplateMeta>({ name: "", tags: [] });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          fetch("/api/v1/clusters"),
          fetch("/api/v1/teams"),
        ]);
        if (cRes.ok) {
          const d = await cRes.json() as { clusters: Array<{ name: string }> };
          setClusters(d.clusters);
          if (d.clusters[0]) setCluster(d.clusters[0].name);
        }
        if (tRes.ok) {
          const d = await tRes.json() as { teams: Team[] };
          setTeams(d.teams ?? []);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
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

  const canSave = meta.name.trim().length > 0 && resources.length > 0 && !saving;
  // Plan 4 Task 7 scope: Publish is not part of the create flow; a newly
  // created template version always starts as `draft` and is published from
  // the template detail page. We expose the button disabled here so the
  // BottomBar shell stays consistent across editor pages — a later task can
  // chain save+publish.
  const canPublish = false;

  async function saveDraft() {
    setErr(null);
    setSaving(true);
    try {
      // display_name is optional in MetaRow; fall back to the slug so the
      // backend's required field is satisfied when the admin leaves it blank.
      const displayName = meta.display_name?.trim() || meta.name;
      const res = await fetch("/api/v1/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: meta.name,
          display_name: displayName,
          tags: meta.tags,
          authoring_mode: "ui",
          owning_team_id: owningTeamId || undefined,
          ui_state: uiState,
        }),
      });
      if (!res.ok) { setErr(`${res.status}: ${await res.text()}`); return; }
      router.push("/templates");
    } finally {
      setSaving(false);
    }
  }

  if (clusters.length === 0) return <div>클러스터가 등록되어 있지 않습니다. 먼저 클러스터를 등록하세요.</div>;

  const tree = (
    <div className="space-y-4">
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
              fields={r.fields}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const inspector = active ? (
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
  );

  const preview = <div className="p-3"><YamlPreview uiState={uiState} /></div>;

  return (
    <div className="space-y-3">
      <MetaRow meta={meta} onChange={setMeta} hideTeam />
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">소유 팀</span>
        <Select
          value={owningTeamId === "" ? GLOBAL_TEAM : owningTeamId}
          onValueChange={(v) => setOwningTeamId(!v || v === GLOBAL_TEAM ? "" : v)}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL_TEAM}>(글로벌 — admin 전용)</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <EditorLayout tree={tree} inspector={inspector} preview={preview} />
      {err && <div className="text-red-600 text-sm whitespace-pre">{err}</div>}
      <BottomBar
        canSave={canSave}
        canPublish={canPublish}
        saving={saving}
        publishing={publishing}
        onSave={saveDraft}
        onPublish={() => setPublishing(false)}
      />
    </div>
  );
}

// ?mode=yaml fallback: mirrors the legacy YAML flow from
// /templates/[name]/edit (used when name === "new"), kept inline here so the
// UI-mode refactor doesn't regress the YAML creation path.
const STARTER_RESOURCES = `apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 1
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: app
          image: nginx:1.25
          ports: [{ containerPort: 80 }]
`;

const STARTER_UISPEC = `fields:
  - path: Deployment[web].spec.replicas
    label: "인스턴스 개수"
    type: integer
    min: 1
    max: 20
    default: 3
`;

function YamlModeNew() {
  const router = useRouter();
  const [meta, setMeta] = useState<TemplateMeta>({ name: "", tags: [] });
  const [teams, setTeams] = useState<Team[]>([]);
  const [owningTeamId, setOwningTeamId] = useState<string>("");
  const [resourcesYaml, setResourcesYaml] = useState(STARTER_RESOURCES);
  const [uispecYaml, setUispecYaml] = useState(STARTER_UISPEC);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tRes = await fetch("/api/v1/teams");
        if (tRes.ok) {
          const d = await tRes.json() as { teams: Team[] };
          setTeams(d.teams ?? []);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const canSave = meta.name.trim().length > 0 && !saving;

  async function saveDraft() {
    setErr(null);
    setSaving(true);
    try {
      const displayName = meta.display_name?.trim() || meta.name;
      const res = await fetch("/api/v1/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: meta.name,
          display_name: displayName,
          tags: meta.tags,
          authoring_mode: "yaml",
          owning_team_id: owningTeamId || undefined,
          resources_yaml: resourcesYaml,
          ui_spec_yaml: uispecYaml,
        }),
      });
      if (!res.ok) { setErr(`${res.status}: ${await res.text()}`); return; }
      const d = await res.json();
      router.push(`/templates/${d.template.name}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <MetaRow meta={meta} onChange={setMeta} hideTeam />
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">소유 팀</span>
        <Select
          value={owningTeamId === "" ? GLOBAL_TEAM : owningTeamId}
          onValueChange={(v) => setOwningTeamId(!v || v === GLOBAL_TEAM ? "" : v)}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL_TEAM}>(글로벌 — admin 전용)</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <YamlEditor label="resources.yaml" value={resourcesYaml} onChange={setResourcesYaml} />
        <YamlEditor label="ui-spec.yaml" value={uispecYaml} onChange={setUispecYaml} />
      </div>
      {err && <div className="text-red-600 text-sm whitespace-pre">{err}</div>}
      <BottomBar
        canSave={canSave}
        canPublish={false}
        saving={saving}
        onSave={saveDraft}
        onPublish={() => {}}
      />
    </div>
  );
}
