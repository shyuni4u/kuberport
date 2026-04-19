"use client";

import { useState } from "react";
import { flattenSchema, SchemaNode } from "@/lib/openapi";

export function SchemaTree({
  schema, selectedPath, onSelect,
}: {
  schema: SchemaNode;
  selectedPath: string | null;
  onSelect: (path: string, node: SchemaNode) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["spec", "metadata"]));
  return (
    <ul className="text-sm font-mono">
      {renderNode("", schema, 0, expanded, setExpanded, selectedPath, onSelect)}
    </ul>
  );
}

function renderNode(
  path: string, node: SchemaNode, depth: number,
  expanded: Set<string>, setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
  selectedPath: string | null,
  onSelect: (path: string, node: SchemaNode) => void,
): React.ReactNode {
  if (node.type === "object" && node.properties) {
    return Object.entries(node.properties).map(([name, child]) => {
      const p = path ? `${path}.${name}` : name;
      const isExp = expanded.has(p);
      const hasKids = (child.type === "object" && !!child.properties) || (child.type === "array" && !!child.items);
      return (
        <li key={p} style={{ paddingLeft: depth * 12 }}>
          <span
            className={`cursor-pointer hover:bg-slate-100 px-1 rounded ${selectedPath === p ? "bg-blue-100" : ""}`}
            onClick={() => {
              onSelect(p, child);
              if (hasKids) {
                setExpanded(prev => {
                  const n = new Set(prev);
                  n.has(p) ? n.delete(p) : n.add(p);
                  return n;
                });
              }
            }}
          >
            {hasKids ? (isExp ? "▾ " : "▸ ") : "· "}
            {name}
            <span className="text-slate-400 ml-2">{child.type ?? "?"}</span>
          </span>
          {isExp && renderNode(p, child, depth + 1, expanded, setExpanded, selectedPath, onSelect)}
        </li>
      );
    });
  }
  if (node.type === "array" && node.items) {
    const p = `${path}[0]`;
    const isExp = expanded.has(p);
    return (
      <li style={{ paddingLeft: depth * 12 }}>
        <span
          className={`cursor-pointer hover:bg-slate-100 px-1 rounded ${selectedPath === p ? "bg-blue-100" : ""}`}
          onClick={() => {
            onSelect(p, node.items!);
            setExpanded(prev => {
              const n = new Set(prev);
              n.has(p) ? n.delete(p) : n.add(p);
              return n;
            });
          }}
        >
          {isExp ? "▾ " : "▸ "}[0]
          <span className="text-slate-400 ml-2">{node.items.type ?? "?"}</span>
        </span>
        {isExp && renderNode(p, node.items, depth + 1, expanded, setExpanded, selectedPath, onSelect)}
      </li>
    );
  }
  return null;
}
