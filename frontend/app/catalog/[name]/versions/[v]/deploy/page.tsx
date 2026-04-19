import { apiFetch } from "@/lib/api-server";
import { notFound } from "next/navigation";
import YAML from "yaml";

import { DeployClient } from "../../../deploy/DeployClient";
import type { UISpec } from "@/lib/ui-spec-to-zod";

// Version-pinned deploy route.
// Used by the UpdateAvailableBadge on the release detail page to re-deploy
// an existing release on a new template version
// (`?updateReleaseId=<uuid>`). When `updateReleaseId` is present we fetch the
// release's `values_json` and hand it to DeployClient as `initialValues` so
// the form starts populated with the existing release's values.
//
// Wire-format note: GET /v1/releases/:id serializes `values_json` from a Go
// `[]byte` (see backend/internal/store/releases.sql.go GetReleaseByIDRow).
// `encoding/json` on `[]byte` emits a **base64-encoded string** of the raw
// JSON bytes. We handle all three plausible shapes defensively:
//   - plain object (already decoded by some future middleware)
//   - plain JSON string (hand-serialized)
//   - base64-encoded JSON string (current Go default)
function parseValuesJson(raw: unknown): Record<string, unknown> | undefined {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || raw.length === 0) return undefined;

  // Try plain JSON first (cheap, and protects us if the backend ever changes
  // to json.RawMessage).
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to base64
  }

  // Try base64 → UTF-8 JSON.
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // swallow — caller gets undefined and the form renders empty
  }
  return undefined;
}

export default async function VersionPinnedDeployPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string; v: string }>;
  searchParams: Promise<{ updateReleaseId?: string }>;
}) {
  const { name, v } = await params;
  const { updateReleaseId } = await searchParams;

  const version = Number(v);
  if (!Number.isFinite(version) || !Number.isInteger(version) || version <= 0) {
    notFound();
  }

  const verRes = await apiFetch(`/v1/templates/${name}/versions/${version}`);
  if (!verRes.ok) notFound();
  const ver = (await verRes.json()) as {
    ui_spec_yaml?: string;
    owning_team_name?: string | null;
  };
  if (!ver.ui_spec_yaml) notFound();

  const spec = (YAML.parse(ver.ui_spec_yaml) as UISpec | undefined) ?? {
    fields: [],
  };

  // Fetch existing release values when re-deploying on a new version.
  // Non-blocking: if the fetch fails (404/403/etc.) we render the form blank
  // rather than failing the whole page. The user can always re-enter values.
  let initialValues: Record<string, unknown> | undefined;
  if (updateReleaseId) {
    const relRes = await apiFetch(`/v1/releases/${updateReleaseId}`);
    if (relRes.ok) {
      const rel = (await relRes.json()) as { values_json?: unknown };
      initialValues = parseValuesJson(rel.values_json);
    }
  }

  return (
    <DeployClient
      templateName={name}
      version={version}
      team={ver.owning_team_name ?? null}
      spec={spec}
      updateReleaseId={updateReleaseId}
      initialValues={initialValues}
    />
  );
}
