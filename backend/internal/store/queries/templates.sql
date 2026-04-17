-- name: ListTemplates :many
SELECT t.*,
       tv.version    AS current_version,
       tv.ui_spec_yaml AS current_ui_spec
  FROM templates t
  LEFT JOIN template_versions tv ON tv.id = t.current_version_id
 ORDER BY t.name;

-- name: GetTemplateByName :one
SELECT * FROM templates WHERE name = $1;

-- name: InsertTemplate :one
INSERT INTO templates (name, display_name, description, tags, owner_user_id)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: UpdateTemplateCurrentVersion :exec
UPDATE templates SET current_version_id = $2, updated_at = now() WHERE id = $1;

-- name: NextTemplateVersion :one
SELECT COALESCE(MAX(version), 0) + 1 FROM template_versions WHERE template_id = $1;

-- name: InsertTemplateVersion :one
INSERT INTO template_versions (
  template_id, version, resources_yaml, ui_spec_yaml, metadata_yaml, status, notes, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: GetTemplateVersion :one
SELECT tv.* FROM template_versions tv
  JOIN templates t ON t.id = tv.template_id
 WHERE t.name = $1 AND tv.version = $2;

-- name: PublishTemplateVersion :one
UPDATE template_versions
   SET status = 'published', published_at = now()
 WHERE id = $1 AND status = 'draft'
 RETURNING *;

-- name: ListTemplateVersions :many
SELECT tv.* FROM template_versions tv
  JOIN templates t ON t.id = tv.template_id
 WHERE t.name = $1
 ORDER BY tv.version DESC;
