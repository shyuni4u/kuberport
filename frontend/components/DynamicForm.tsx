"use client";

import { useForm, Controller } from "react-hook-form";
import { z, type ZodTypeAny } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

export interface UISpecField {
  path: string;
  label: string;
  help?: string;
  type: "string" | "integer" | "boolean" | "enum";
  min?: number;
  max?: number;
  pattern?: string;
  values?: string[];
  placeholder?: string;
  default?: unknown;
  required?: boolean;
}

export interface UISpec {
  fields: UISpecField[];
}

function buildZodSchema(spec: UISpec) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of spec.fields) {
    let s: ZodTypeAny;
    switch (f.type) {
      case "integer": {
        let n = z.coerce.number().int();
        if (f.min !== undefined) n = n.min(f.min);
        if (f.max !== undefined) n = n.max(f.max);
        s = n;
        break;
      }
      case "string": {
        let str = z.string();
        if (f.pattern) str = str.regex(new RegExp(f.pattern));
        s = str;
        break;
      }
      case "boolean":
        s = z.boolean();
        break;
      case "enum":
        s = z.enum(f.values as [string, ...string[]]);
        break;
    }
    shape[f.path] = f.required !== false ? s : s.optional();
  }
  return z.object(shape);
}

function defaultsFromSpec(spec: UISpec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.fields) {
    if (f.default !== undefined) out[f.path] = f.default;
  }
  return out;
}

function FieldInput({
  spec,
  value,
  onChange,
}: {
  spec: UISpecField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (spec.type) {
    case "integer":
      return (
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          value={(value as number | undefined) ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="border rounded px-3 py-1.5 w-32"
        />
      );
    case "enum":
      return (
        <select
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-3 py-1.5"
        >
          {spec.values!.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "string":
      return (
        <input
          type="text"
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.placeholder}
          className="border rounded px-3 py-1.5 w-full"
        />
      );
  }
}

export function DynamicForm({
  spec,
  initialValues,
  onSubmit,
}: {
  spec: UISpec;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const form = useForm({
    resolver: zodResolver(buildZodSchema(spec)),
    defaultValues: initialValues ?? defaultsFromSpec(spec),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {spec.fields.map((f) => (
        <div key={f.path}>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {f.label}
            {f.required !== false && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </label>
          <Controller
            name={f.path}
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FieldInput
                  spec={f}
                  value={field.value}
                  onChange={field.onChange}
                />
                {f.help && (
                  <p className="text-xs text-slate-500 mt-1">{f.help}</p>
                )}
                {fieldState.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />
        </div>
      ))}
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        배포
      </button>
    </form>
  );
}
