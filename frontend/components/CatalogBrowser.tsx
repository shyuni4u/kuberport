"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CatalogCard, type CatalogCardTemplate } from "./CatalogCard";

type Props = { templates: CatalogCardTemplate[] };

export function CatalogBrowser({ templates }: Props) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>("");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) for (const tg of t.tags) set.add(tg);
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (tag && !t.tags.includes(tag)) return false;
      if (ql) {
        const hay = (t.display_name + " " + (t.description ?? "")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [templates, q, tag]);

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <p className="text-sm">관리자가 아직 템플릿을 만들지 않았습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">카탈로그</h1>
        <Input
          className="max-w-xs"
          placeholder="템플릿 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {allTags.length > 0 && (
        <ToggleGroup
          value={tag ? [tag] : []}
          onValueChange={(v) => setTag(v[0] ?? "")}
          className="flex-wrap justify-start"
        >
          {allTags.map((t) => (
            <ToggleGroupItem key={t} value={t}>{t}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          일치하는 템플릿이 없습니다. 검색어나 태그 필터를 바꿔보세요.
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
        >
          {filtered.map((t) => (
            <CatalogCard key={t.name} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
