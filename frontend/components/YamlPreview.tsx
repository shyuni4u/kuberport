"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export interface UIModeTemplate {
  resources: Array<{
    apiVersion: string;
    kind: string;
    name: string;
    fields: Record<string, unknown>; // UIField values (shape: see FieldInspector.UIField)
  }>;
}

export function YamlPreview({ uiState }: { uiState: UIModeTemplate }) {
  const [resources, setResources] = useState("");
  const [uispec, setUISpec] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/templates/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ui_state: uiState }),
        });
        if (!res.ok) {
          setErr(`${res.status}: ${await res.text()}`);
          return;
        }
        const d = await res.json() as { resources_yaml: string; ui_spec_yaml: string };
        setResources(d.resources_yaml);
        setUISpec(d.ui_spec_yaml);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [uiState]);

  return (
    <div className="space-y-3">
      {err && <div className="text-red-600 text-sm whitespace-pre">{err}</div>}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 mb-1">resources.yaml</h3>
        <Monaco height="240px" language="yaml" value={resources} options={{ readOnly: true, minimap: { enabled: false } }} />
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-500 mb-1">ui-spec.yaml</h3>
        <Monaco height="160px" language="yaml" value={uispec} options={{ readOnly: true, minimap: { enabled: false } }} />
      </div>
    </div>
  );
}
