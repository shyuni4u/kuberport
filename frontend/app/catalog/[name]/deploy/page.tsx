import { apiFetch } from "@/lib/api-server";
import { notFound } from "next/navigation";
import YAML from "yaml";

import { DeployClient } from "./DeployClient";
import type { UISpec } from "@/lib/ui-spec-to-zod";

// GET /v1/templates/:name returns the raw `templates` row (no current_version
// integer, no owning_team_name). Plan 3 Task 8 needs the integer version to
// pass to the client for display + render endpoint ?version= argument. We
// resolve it via the list endpoint (which JOINs template_versions and
// exposes `current_version`) rather than adding a backend column — matches
// what /catalog/page.tsx does.
type ListedTemplate = {
  name: string;
  display_name?: string;
  current_version: number | null;
  current_status: string | null;
  owning_team_name?: string | null;
};

type TemplateVersion = {
  ui_spec_yaml: string;
};

export default async function DeployPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ updateReleaseId?: string }>;
}) {
  const { name } = await params;
  const { updateReleaseId } = await searchParams;

  const listRes = await apiFetch("/v1/templates");
  if (!listRes.ok) notFound();
  const listBody = (await listRes.json()) as { templates: ListedTemplate[] };
  const t = listBody.templates.find((row) => row.name === name);
  if (!t || t.current_version == null) notFound();

  const vRes = await apiFetch(
    `/v1/templates/${name}/versions/${t.current_version}`,
  );
  if (!vRes.ok) notFound();
  const v = (await vRes.json()) as TemplateVersion;
  const spec = (YAML.parse(v.ui_spec_yaml) as UISpec | undefined) ?? {
    fields: [],
  };

  return (
    <DeployClient
      templateName={name}
      version={t.current_version}
      team={t.owning_team_name ?? null}
      spec={spec}
      updateReleaseId={updateReleaseId}
    />
  );
}
