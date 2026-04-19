// OpenAPI v3 index (list of GroupVersions) response shape:
// { paths: { "apis/apps/v1": { serverRelativeURL: "/openapi/v3/apis/apps/v1" }, ... } }
// And a GroupVersion response like /openapi/v3/apis/apps/v1 has `components.schemas[kindName]`.

export interface OpenAPIIndex {
  paths: Record<string, { serverRelativeURL: string }>;
}

export interface OpenAPISchemaDoc {
  components?: { schemas?: Record<string, SchemaNode> };
}

export interface SchemaNode {
  type?: "object" | "string" | "integer" | "number" | "boolean" | "array";
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: Array<string | number>;
  $ref?: string;
  "x-kubernetes-group-version-kind"?: Array<{ group: string; version: string; kind: string }>;
}

/** Parse the OpenAPI index response into a list of GroupVersion strings. */
export function parseIndex(idx: OpenAPIIndex): string[] {
  return Object.keys(idx.paths ?? {})
    .filter(p => p.startsWith("apis/") || p === "api/v1")
    .map(p => p.replace(/^apis\//, "").replace(/^api\//, ""));
}

/** Find the top-level schema for a (group, version, kind) tuple. */
export function findKindSchema(doc: OpenAPISchemaDoc, group: string, version: string, kind: string): SchemaNode | null {
  const schemas = doc.components?.schemas ?? {};
  for (const name of Object.keys(schemas)) {
    const s = schemas[name];
    const gvks = s["x-kubernetes-group-version-kind"];
    if (!gvks) continue;
    for (const gvk of gvks) {
      if (gvk.group === group && gvk.version === version && gvk.kind === kind) {
        return resolveRefs(s, schemas);
      }
    }
  }
  return null;
}

/** Resolve all $ref entries inline (best-effort, cycles break into {$ref} leaves). */
export function resolveRefs(node: SchemaNode, schemas: Record<string, SchemaNode>, seen = new Set<string>()): SchemaNode {
  if (node.$ref) {
    const name = node.$ref.replace(/^#\/components\/schemas\//, "");
    if (seen.has(name)) return { type: "object", description: `(cycle: ${name})` };
    const target = schemas[name];
    if (!target) return node;
    return resolveRefs(target, schemas, new Set(seen).add(name));
  }
  const out: SchemaNode = { ...node };
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, resolveRefs(v, schemas, seen)]),
    );
  }
  if (node.items) out.items = resolveRefs(node.items, schemas, seen);
  return out;
}

export interface FlatField {
  path: string;     // e.g. "spec.replicas" or "spec.template.spec.containers[0].image"
  node: SchemaNode;
  required: boolean;
}

/** Walk a schema and yield every leaf-ish path (and every object node too).
 *  Array types yield a `[0]` path so the editor can set a first element. */
export function flattenSchema(root: SchemaNode, prefix = ""): FlatField[] {
  const out: FlatField[] = [];
  if (root.type === "object" && root.properties) {
    for (const [name, child] of Object.entries(root.properties)) {
      const p = prefix ? `${prefix}.${name}` : name;
      const required = (root.required ?? []).includes(name);
      out.push({ path: p, node: child, required });
      out.push(...flattenSchema(child, p));
    }
  } else if (root.type === "array" && root.items) {
    const p = `${prefix}[0]`;
    out.push({ path: p, node: root.items, required: false });
    out.push(...flattenSchema(root.items, p));
  }
  return out;
}
