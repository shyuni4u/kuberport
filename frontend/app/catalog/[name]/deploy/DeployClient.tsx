"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import { useDebouncedCallback } from "use-debounce";

import { DynamicForm } from "@/components/DynamicForm";
import { RBACCheckPanel } from "@/components/RBACCheckPanel";
import { ResourcesPreview } from "@/components/ResourcesPreview";
import { Input } from "@/components/ui/input";
import type { UISpec } from "@/lib/ui-spec-to-zod";

type Props = {
  templateName: string;
  version: number;
  team: string | null;
  spec: UISpec;
  updateReleaseId?: string;
  initialValues?: Record<string, unknown>;
};

type Meta = { name: string; cluster: string; namespace: string };

export function DeployClient({
  templateName,
  version,
  team,
  spec,
  updateReleaseId,
  initialValues,
}: Props) {
  const router = useRouter();
  const isUpdate = Boolean(updateReleaseId);

  const [meta, setMeta] = useState<Meta>({
    name: "",
    cluster: "",
    namespace: "default",
  });
  const [rendered, setRendered] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Hydrate cluster from localStorage on mount. Skipped for update flows:
  // cluster is immutable on PUT (backend ignores it) and the meta inputs
  // aren't rendered in update mode, so there's nothing to prefill.
  // The setState-in-effect rule is correctly appeased here: localStorage
  // is an external system we're reading once on mount, not derivable from
  // props/state. There's no cascading-render risk because this only fires
  // on the initial render.
  useEffect(() => {
    if (isUpdate) return;
    const cached =
      typeof window !== "undefined"
        ? localStorage.getItem("kbp_cluster")
        : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setMeta((m) => ({ ...m, cluster: cached }));
  }, [isUpdate]);

  // Debounced preview render. 300ms matches the ResourcesPreview ergonomics —
  // fast enough to feel live while a user is typing but not spamming the
  // backend. Errors (400 from missing-required etc.) clear the preview; the
  // form's own validation surfaces the actual problem inline.
  const preview = useDebouncedCallback(
    async (values: Record<string, unknown>) => {
      setPending(true);
      try {
        const res = await fetch(
          `/api/v1/templates/${templateName}/render?version=${version}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
          },
        );
        if (!res.ok) {
          setRendered(null);
          return;
        }
        const body = (await res.json()) as { rendered_yaml: string };
        setRendered(body.rendered_yaml);
      } catch {
        setRendered(null);
      } finally {
        setPending(false);
      }
    },
    300,
  );

  // Kinds extracted from the rendered YAML for RBAC preflight. Deriving from
  // the *rendered* yaml (not the template source) ensures conditionally-
  // included resources are reflected correctly.
  const kinds = useMemo(() => {
    if (!rendered) return [];
    try {
      return YAML.parseAllDocuments(rendered)
        .map((d) => (d.toJS() as { kind?: string } | null)?.kind)
        .filter((k): k is string => !!k);
    } catch {
      return [];
    }
  }, [rendered]);

  const submit = useCallback(
    async (values: Record<string, unknown>) => {
      setSubmitting(true);
      setErr(null);
      try {
        if (updateReleaseId) {
          const r = await fetch(`/api/v1/releases/${updateReleaseId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version, values }),
          });
          if (!r.ok) {
            throw new Error(await r.text());
          }
          router.push(`/releases/${updateReleaseId}`);
        } else {
          const r = await fetch("/api/v1/releases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              template: templateName,
              version,
              name: meta.name,
              cluster: meta.cluster,
              namespace: meta.namespace,
              values,
            }),
          });
          if (!r.ok) {
            throw new Error(await r.text());
          }
          const body = (await r.json()) as { id: string };
          router.push(`/releases/${body.id}`);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [updateReleaseId, version, templateName, meta, router],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.85fr]">
      <div>
        <header className="mb-4">
          <h1 className="text-lg font-semibold">
            {isUpdate ? `v${version} 로 업데이트` : "새 배포"}
          </h1>
          <p className="text-xs text-slate-600">
            {templateName} · v{version}
            {team ? ` · ${team} 팀` : ""}
          </p>
        </header>
        {!isUpdate && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Input
              placeholder="릴리스 이름"
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
            />
            <Input
              placeholder="클러스터"
              value={meta.cluster}
              onChange={(e) => setMeta({ ...meta, cluster: e.target.value })}
            />
            <Input
              placeholder="네임스페이스"
              className="col-span-2"
              value={meta.namespace}
              onChange={(e) => setMeta({ ...meta, namespace: e.target.value })}
            />
          </div>
        )}
        <DynamicForm
          spec={spec}
          initialValues={initialValues}
          submitLabel={isUpdate ? `v${version} 로 업데이트` : "배포하기"}
          onChange={preview}
          onSubmit={submit}
        />
        {err && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-red-700">{err}</p>
        )}
        {submitting && (
          <p className="mt-2 text-sm text-slate-600">처리 중…</p>
        )}
      </div>
      <aside className="flex flex-col gap-3">
        <ResourcesPreview renderedYaml={rendered} pending={pending} />
        {meta.cluster && meta.namespace && (
          <RBACCheckPanel
            cluster={meta.cluster}
            namespace={meta.namespace}
            kinds={kinds}
          />
        )}
      </aside>
    </div>
  );
}
