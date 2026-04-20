"use client";

import type { SchemaNode } from "@/lib/openapi";

export type UIField =
  | { mode: "fixed"; fixedValue: unknown }
  | {
      mode: "exposed";
      uiSpec: {
        label: string;
        type: "string" | "integer" | "boolean" | "enum";
        min?: number; max?: number;
        pattern?: string; values?: string[];
        default?: unknown; required?: boolean; help?: string;
      };
    };

export function FieldInspector({
  path, node, value, onChange, onClear,
}: {
  path: string;
  node: SchemaNode;
  value: UIField | undefined;
  onChange: (v: UIField) => void;
  onClear: () => void;
}) {
  const mode = value?.mode ?? null;
  const schemaType = mapSchemaType(node);

  return (
    <div className="border rounded p-4 text-sm">
      <div className="font-mono text-xs text-slate-500 mb-2">{path}</div>
      <div className="flex gap-2 mb-3">
        <button
          className={`px-2 py-1 rounded text-xs ${mode === "fixed" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          onClick={() => onChange({ mode: "fixed", fixedValue: defaultFor(schemaType) })}
        >값 고정</button>
        <button
          className={`px-2 py-1 rounded text-xs ${mode === "exposed" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          onClick={() => onChange({ mode: "exposed", uiSpec: { label: path, type: schemaType, required: false } })}
        >사용자 노출</button>
        {value && <button className="ml-auto text-xs text-red-600" onClick={onClear}>초기화</button>}
      </div>

      {value?.mode === "fixed" && (
        <div>
          <label className="block text-xs mb-1">값</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={String(value.fixedValue ?? "")}
            onChange={e => onChange({ mode: "fixed", fixedValue: coerce(e.target.value, schemaType) })}
          />
        </div>
      )}

      {value?.mode === "exposed" && (
        <div className="space-y-2">
          <Labeled label="라벨" v={value.uiSpec.label}
            onChange={x => onChange({ ...value, uiSpec: { ...value.uiSpec, label: x } })}/>
          <Labeled label="기본값" v={String(value.uiSpec.default ?? "")}
            onChange={x => onChange({ ...value, uiSpec: { ...value.uiSpec, default: coerce(x, value.uiSpec.type) } })}/>
          {value.uiSpec.type === "enum" && (
            <div>
              <label className="block text-xs mb-1">Values</label>
              <div className="space-y-1">
                {(value.uiSpec.values ?? []).map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="border rounded px-2 py-1 flex-1"
                      value={v}
                      onChange={e => {
                        const next = [...(value.uiSpec.values ?? [])];
                        next[i] = e.target.value;
                        onChange({ ...value, uiSpec: { ...value.uiSpec, values: next } });
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600 px-2"
                      onClick={() => {
                        const next = (value.uiSpec.values ?? []).filter((_, j) => j !== i);
                        onChange({ ...value, uiSpec: { ...value.uiSpec, values: next } });
                      }}
                    >삭제</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-blue-600 mt-1"
                  onClick={() => {
                    const next = [...(value.uiSpec.values ?? []), ""];
                    onChange({ ...value, uiSpec: { ...value.uiSpec, values: next } });
                  }}
                >+ 값 추가</button>
              </div>
            </div>
          )}
          {value.uiSpec.type === "integer" && (
            <>
              <Labeled label="min" v={String(value.uiSpec.min ?? "")}
                onChange={x => onChange({ ...value, uiSpec: { ...value.uiSpec, min: x ? Number(x) : undefined } })}/>
              <Labeled label="max" v={String(value.uiSpec.max ?? "")}
                onChange={x => onChange({ ...value, uiSpec: { ...value.uiSpec, max: x ? Number(x) : undefined } })}/>
            </>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!value.uiSpec.required}
              onChange={e => onChange({ ...value, uiSpec: { ...value.uiSpec, required: e.target.checked } })}/>
            필수 입력
          </label>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1">{label}</label>
      <input className="border rounded px-2 py-1 w-full" value={v} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function mapSchemaType(n: SchemaNode): "string" | "integer" | "boolean" | "enum" {
  if (n.enum) return "enum";
  if (n.type === "integer" || n.type === "number") return "integer";
  if (n.type === "boolean") return "boolean";
  return "string";
}

function defaultFor(t: "string" | "integer" | "boolean" | "enum"): unknown {
  if (t === "integer") return 0;
  if (t === "boolean") return false;
  return "";
}

function coerce(raw: string, t: "string" | "integer" | "boolean" | "enum"): unknown {
  if (t === "integer") return raw === "" ? undefined : Number(raw);
  if (t === "boolean") return raw === "true";
  return raw;
}
