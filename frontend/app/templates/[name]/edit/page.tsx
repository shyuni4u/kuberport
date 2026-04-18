"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { YamlEditor } from "@/components/YamlEditor";

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

export default function EditTemplatePage() {
  const router = useRouter();
  const { name } = useParams<{ name: string }>();
  const isNew = name === "new";
  const [displayName, setDisplayName] = useState("Web Service");
  const [description, setDescription] = useState("");
  const [resources, setResources] = useState(STARTER_RESOURCES);
  const [uispec, setUispec] = useState(STARTER_UISPEC);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const slug = isNew
      ? prompt("템플릿 slug (영문소문자-, 예: web-service)")?.trim()
      : name;
    if (!slug) return;

    const body = {
      name: slug,
      display_name: displayName,
      description,
      tags: [],
      resources_yaml: resources,
      ui_spec_yaml: uispec,
    };
    const res = await fetch("/api/v1/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    const d = await res.json();
    router.push(`/templates/${d.template.name}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">
          {isNew ? "새 템플릿" : displayName}
        </h1>
        <button
          onClick={save}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm"
        >
          Save draft
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          className="border rounded px-3 py-1.5"
          placeholder="표시 이름"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-1.5"
          placeholder="설명"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <YamlEditor
          label="resources.yaml"
          value={resources}
          onChange={setResources}
        />
        <YamlEditor
          label="ui-spec.yaml"
          value={uispec}
          onChange={setUispec}
        />
      </div>
      {err && (
        <div className="mt-3 text-red-600 text-sm whitespace-pre">{err}</div>
      )}
    </div>
  );
}
