"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DynamicForm, type UISpec } from "@/components/DynamicForm";
import YAML from "yaml";

export default function DeployPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<Record<string, unknown> | null>(
    null,
  );
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [cluster, setCluster] = useState<string>("");
  const [releaseName, setReleaseName] = useState<string>("");
  const [namespace, setNamespace] = useState<string>("default");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCluster(localStorage.getItem("kbp_cluster") ?? "");
    fetch(`/api/v1/templates/${name}`)
      .then((r) => r.json())
      .then((t) => {
        setTemplate(t);
        fetch(`/api/v1/templates/${name}/versions/${t.current_version}`)
          .then((r) => r.json())
          .then((v) => setSpec(YAML.parse(v.ui_spec_yaml)));
      });
  }, [name]);

  async function submit(values: Record<string, unknown>) {
    setErr(null);
    const res = await fetch("/api/v1/releases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: name,
        version: (template as Record<string, unknown>)?.current_version,
        cluster,
        namespace,
        name: releaseName,
        values,
      }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    const d = await res.json();
    router.push(`/releases/${d.id}`);
  }

  if (!template || !spec) return <div>로딩 중…</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">
        {(template as Record<string, string>).display_name} 배포
      </h1>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <input
          placeholder="릴리스 이름"
          value={releaseName}
          onChange={(e) => setReleaseName(e.target.value)}
          className="border rounded px-3 py-1.5"
        />
        <input
          placeholder="네임스페이스"
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          className="border rounded px-3 py-1.5"
        />
        <div className="text-sm text-slate-600 self-center">
          cluster: <b>{cluster}</b>
        </div>
      </div>
      <DynamicForm spec={spec} onSubmit={submit} />
      {err && (
        <div className="mt-3 text-red-600 text-sm whitespace-pre">{err}</div>
      )}
    </div>
  );
}
