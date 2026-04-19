package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"kuberport/internal/store"
	"kuberport/internal/template"
)

// previewRenderReq is the body for POST /v1/templates/:name/render.
// Values is treated as an opaque JSON object forwarded to template.Render;
// the template's ui-spec decides which keys are required.
type previewRenderReq struct {
	Values json.RawMessage `json:"values"`
}

// PreviewRender renders a template with the supplied values for UI preview.
// Does NOT apply to k8s and does NOT persist anything.
//
// Version selection:
//   - ?version=N           → render that specific version (any status).
//   - no ?version          → render the template's current published version.
//     If the template has no current_version_id set (never published), → 404.
//
// Error mapping:
//   - malformed JSON body                     → 400 validation-error
//   - non-integer ?version                    → 400 validation-error
//   - unknown template                        → 404 not-found
//   - unknown version / no published version  → 404 not-found
//   - template.Render error (missing required
//     field, pattern mismatch, min/max, etc.) → 400 validation-error
//     (surfaced verbatim so the UI can highlight the offending field)
func (h *Handlers) PreviewRender(c *gin.Context) {
	var r previewRenderReq
	if err := c.ShouldBindJSON(&r); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}
	if len(r.Values) == 0 {
		// template.Render requires a JSON object; normalize missing body.
		r.Values = json.RawMessage("{}")
	}

	ctx := c.Request.Context()
	name := c.Param("name")

	// Resolve target version. Integer parse failure (bad query param) is
	// distinct from "version not found" — the former is the caller's bug.
	var tv store.TemplateVersion
	if vs := c.Query("version"); vs != "" {
		v64, err := strconv.ParseInt(vs, 10, 32)
		if err != nil {
			writeError(c, http.StatusBadRequest, "validation-error", "version must be integer")
			return
		}
		tv, err = h.deps.Store.GetTemplateVersion(ctx, store.GetTemplateVersionParams{
			Name:    name,
			Version: int32(v64),
		})
		if err != nil {
			writeError(c, http.StatusNotFound, "not-found", "template version")
			return
		}
	} else {
		// Default: current published version. Resolve via the template row
		// (current_version_id → uuid), then find that row in the per-template
		// version list. ListTemplateVersions is bounded by the number of
		// versions per template (small in practice) and already exists, so we
		// avoid adding a new Store query just for this lookup.
		// Any error (including pgx.ErrNoRows) resolves to 404: same shape as
		// h.GetTemplate in templates.go. A real DB outage will still surface
		// as 404 here, which is misleading but matches existing behavior —
		// improving that is a separate concern, not Task 1.
		tpl, err := h.deps.Store.GetTemplateByName(ctx, name)
		if err != nil {
			writeError(c, http.StatusNotFound, "not-found", "template")
			return
		}
		if !tpl.CurrentVersionID.Valid {
			writeError(c, http.StatusNotFound, "not-found", "template has no published version; pass ?version=N")
			return
		}
		versions, err := h.deps.Store.ListTemplateVersions(ctx, name)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		found := false
		for _, v := range versions {
			if v.ID == tpl.CurrentVersionID {
				tv = v
				found = true
				break
			}
		}
		if !found {
			// Defensive: current_version_id points at a row that no longer
			// exists (data inconsistency) — treat as no published version.
			writeError(c, http.StatusNotFound, "not-found", "template has no published version; pass ?version=N")
			return
		}
	}

	rendered, err := template.Render(tv.ResourcesYaml, tv.UiSpecYaml, r.Values, template.Labels{
		TemplateName:    name,
		TemplateVersion: int(tv.Version),
		ReleaseName:     "preview",
		// ReleaseID / AppliedBy left empty: preview is not a real release.
	})
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"template":      name,
		"version":       tv.Version,
		"rendered_yaml": string(rendered),
	})
}
