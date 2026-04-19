"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type TemplateMeta = {
  name: string;
  display_name?: string;
  team?: string | null;
  tags: string[];
};

type Props = {
  meta: TemplateMeta;
  onChange: (m: TemplateMeta) => void;
  nameLocked?: boolean;
};

export function MetaRow({ meta, onChange, nameLocked }: Props) {
  const [tagInput, setTagInput] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-slate-50 px-4 py-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">이름</span>
        <Input
          className="w-48 text-sm"
          value={meta.name}
          disabled={nameLocked}
          onChange={(e) => onChange({ ...meta, name: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-slate-600">팀</span>
        <Input
          className="w-32 text-sm"
          value={meta.team ?? ""}
          onChange={(e) => onChange({ ...meta, team: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {meta.tags.map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">
            {t}
            <button
              type="button"
              aria-label={`remove tag ${t}`}
              className="ml-1 opacity-60 hover:opacity-100"
              onClick={() =>
                onChange({
                  ...meta,
                  tags: meta.tags.filter((x) => x !== t),
                })
              }
            >
              ×
            </button>
          </Badge>
        ))}
        <Input
          placeholder="태그 추가"
          className="h-7 w-28 text-xs"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tagInput.trim()) {
              e.preventDefault();
              const next = tagInput.trim();
              if (!meta.tags.includes(next)) {
                onChange({ ...meta, tags: [...meta.tags, next] });
              }
              setTagInput("");
            }
          }}
        />
      </div>
    </div>
  );
}
