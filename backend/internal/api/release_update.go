package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"kuberport/internal/auth"
	"kuberport/internal/store"
	"kuberport/internal/template"
)

// updateReleaseReq is the body of PUT /v1/releases/:id.
//
// Template name, cluster, and namespace are NOT accepted here: those are
// immutable for an existing release. Changing them requires a new release.
// (Any such keys on the wire are silently ignored — Gin's default binding
// drops unknown fields.)
type updateReleaseReq struct {
	Version int             `json:"version" binding:"required,min=1"`
	Values  json.RawMessage `json:"values"  binding:"required"`
}

// UpdateRelease re-renders and re-applies an existing release with new
// values (and optionally a new template version).
//
// Authorization: admin OR the user who created the release.
//
// Ordering (apply → DB):
//
//  1. Fetch release row + capture old rendered_yaml for rollback.
//  2. Resolve the target template version by (template_id, version). Reject
//     deprecated (400) / unpublished (409) / unknown (400).
//  3. Render the new YAML — validation errors surface as 400.
//  4. Apply new YAML to k8s — failure → 502 (DB untouched).
//  5. Update DB. If the UPDATE fails after a successful apply, re-apply
//     the old YAML to keep k8s and DB consistent, then return 500.
//
// This "apply-first" ordering mirrors how CreateRelease rolls back
// (CreateRelease inserts then applies; if apply fails, delete both).
// For an update there is no row to roll back — we restore prior state
// instead.
func (h *Handlers) UpdateRelease(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", "invalid release id")
		return
	}

	var req updateReleaseReq
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)

	// Load the release; establishes immutable cluster/namespace/template name.
	rel, err := h.deps.Store.GetReleaseByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusNotFound, "not-found", "release")
			return
		}
		log.Printf("UpdateRelease GetReleaseByID: %v", err)
		writeError(c, http.StatusNotFound, "not-found", "release")
		return
	}

	// AuthZ: admin OR release creator (mirrors GetRelease / DeleteRelease).
	if !isAdmin(c) {
		user, ok := h.resolveUser(c)
		if !ok {
			return
		}
		if rel.CreatedByUserID != user.ID {
			writeError(c, http.StatusForbidden, "rbac-denied", "not the release owner")
			return
		}
	}

	// Resolve the target version FOR THIS release's template. Going through
	// template name + version matches CreateRelease's pattern and ensures the
	// caller can't sneak in a version from a different template.
	tv, err := h.deps.Store.GetTemplateVersion(ctx, store.GetTemplateVersionParams{
		Name:    rel.TemplateName,
		Version: int32(req.Version),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusBadRequest, "validation-error",
				"unknown template version "+strconv.Itoa(req.Version)+" for template "+rel.TemplateName)
			return
		}
		log.Printf("UpdateRelease GetTemplateVersion: %v", err)
		writeError(c, http.StatusInternalServerError, "internal", "failed to load template version")
		return
	}
	if tv.Status == "deprecated" {
		writeError(c, http.StatusBadRequest, "validation-error",
			"template "+rel.TemplateName+" v"+strconv.Itoa(int(tv.Version))+" is deprecated; pick a non-deprecated version")
		return
	}
	if tv.Status != "published" {
		writeError(c, http.StatusConflict, "conflict", "version not published")
		return
	}

	// Render with new values. ReleaseID uses rel.Name for consistency with
	// CreateRelease (labels use the stable human name, not the UUID).
	rendered, err := template.Render(tv.ResourcesYaml, tv.UiSpecYaml, req.Values, template.Labels{
		ReleaseName:     rel.Name,
		TemplateName:    rel.TemplateName,
		TemplateVersion: req.Version,
		ReleaseID:       rel.Name,
		AppliedBy:       u.Email,
	})
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	// Apply to k8s BEFORE mutating DB. If apply fails we return 502 and DB is
	// still consistent (reflects the old, still-deployed, state).
	cli, err := h.deps.K8sFactory.NewWithToken(rel.ClusterApiUrl, rel.ClusterCaBundle.String, u.IDToken)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "k8s-error", err.Error())
		return
	}
	if err := cli.ApplyAll(ctx, rel.Namespace, rendered); err != nil {
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}

	// DB update. On failure, try to re-apply the OLD rendered_yaml so k8s
	// reflects the committed DB state. Best-effort — log any rollback error.
	if err := h.deps.Store.UpdateReleaseValuesAndVersion(ctx, store.UpdateReleaseValuesAndVersionParams{
		ID:                id,
		TemplateVersionID: tv.ID,
		ValuesJson:        req.Values,
		RenderedYaml:      string(rendered),
	}); err != nil {
		log.Printf("UpdateRelease UpdateReleaseValuesAndVersion: %v", err)
		rollbackCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if rbErr := cli.ApplyAll(rollbackCtx, rel.Namespace, []byte(rel.RenderedYaml)); rbErr != nil {
			log.Printf("rollback: failed to re-apply old yaml for release %s: %v", rel.Name, rbErr)
		}
		writeError(c, http.StatusInternalServerError, "internal", "failed to update release")
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": id, "version": req.Version})
}
