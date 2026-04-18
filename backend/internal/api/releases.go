package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"kuberport/internal/auth"
	"kuberport/internal/store"
	"kuberport/internal/template"
)

type createReleaseReq struct {
	Template  string          `json:"template"  binding:"required"`
	Version   int             `json:"version"   binding:"required,min=1"`
	Cluster   string          `json:"cluster"   binding:"required"`
	Namespace string          `json:"namespace" binding:"required"`
	Name      string          `json:"name"      binding:"required,hostname_rfc1123"`
	Values    json.RawMessage `json:"values"    binding:"required"`
}

// resolveUser upserts the authenticated user and returns the DB record.
func (h *Handlers) resolveUser(c *gin.Context) (store.User, bool) {
	u, _ := auth.UserFrom(c.Request.Context())
	user, err := h.deps.Store.UpsertUser(c.Request.Context(), store.UpsertUserParams{
		OidcSubject: u.Subject,
		Email:       store.PgText(u.Email),
		DisplayName: store.PgText(u.Name),
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return store.User{}, false
	}
	return user, true
}

// isAdmin returns true if the authenticated user belongs to kuberport-admin.
func isAdmin(c *gin.Context) bool {
	u, _ := auth.UserFrom(c.Request.Context())
	for _, g := range u.Groups {
		if g == "kuberport-admin" {
			return true
		}
	}
	return false
}

func (h *Handlers) CreateRelease(c *gin.Context) {
	var r createReleaseReq
	if err := c.ShouldBindJSON(&r); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}
	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)

	tv, err := h.deps.Store.GetTemplateVersion(ctx, store.GetTemplateVersionParams{
		Name:    r.Template,
		Version: int32(r.Version),
	})
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "template version")
		return
	}
	if tv.Status != "published" {
		writeError(c, http.StatusConflict, "conflict", "version not published")
		return
	}

	cluster, err := h.deps.Store.GetClusterByName(ctx, r.Cluster)
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "cluster")
		return
	}

	rendered, err := template.Render(tv.ResourcesYaml, tv.UiSpecYaml, r.Values, template.Labels{
		ReleaseName:     r.Name,
		TemplateName:    r.Template,
		TemplateVersion: r.Version,
		ReleaseID:       r.Name,
		AppliedBy:       u.Email,
	})
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	user, ok := h.resolveUser(c)
	if !ok {
		return
	}

	rel, err := h.deps.Store.InsertRelease(ctx, store.InsertReleaseParams{
		Name:              r.Name,
		TemplateVersionID: tv.ID,
		ClusterID:         cluster.ID,
		Namespace:         r.Namespace,
		ValuesJson:        r.Values,
		RenderedYaml:      string(rendered),
		CreatedByUserID:   user.ID,
	})
	if err != nil {
		writeError(c, http.StatusConflict, "conflict", err.Error())
		return
	}

	caBundle := cluster.CaBundle.String
	cli, err := h.deps.K8sFactory.NewWithToken(cluster.ApiUrl, caBundle, u.IDToken)
	if err != nil {
		_ = h.deps.Store.DeleteRelease(ctx, rel.ID)
		writeError(c, http.StatusInternalServerError, "k8s-error", err.Error())
		return
	}
	if err := cli.ApplyAll(ctx, r.Namespace, rendered); err != nil {
		_ = h.deps.Store.DeleteRelease(ctx, rel.ID)
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}
	c.JSON(http.StatusCreated, rel)
}

func (h *Handlers) ListReleases(c *gin.Context) {
	ctx := c.Request.Context()

	if isAdmin(c) {
		rows, err := h.deps.Store.ListAllReleases(ctx)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		if rows == nil {
			rows = []store.ListAllReleasesRow{}
		}
		c.JSON(http.StatusOK, gin.H{"releases": rows})
		return
	}

	user, ok := h.resolveUser(c)
	if !ok {
		return
	}
	rows, err := h.deps.Store.ListReleasesForUser(ctx, user.ID)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []store.ListReleasesForUserRow{}
	}
	c.JSON(http.StatusOK, gin.H{"releases": rows})
}

func (h *Handlers) GetRelease(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", "invalid release id")
		return
	}
	ctx := c.Request.Context()
	rel, err := h.deps.Store.GetReleaseByID(ctx, id)
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "release")
		return
	}

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

	c.JSON(http.StatusOK, rel)
}

func (h *Handlers) DeleteRelease(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", "invalid release id")
		return
	}
	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)

	rel, err := h.deps.Store.GetReleaseByID(ctx, id)
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "release")
		return
	}

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

	cli, err := h.deps.K8sFactory.NewWithToken(rel.ClusterApiUrl, rel.ClusterCaBundle.String, u.IDToken)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "k8s-error", err.Error())
		return
	}
	if err := cli.DeleteByRelease(ctx, rel.Namespace, rel.Name); err != nil {
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}

	if err := h.deps.Store.DeleteRelease(ctx, id); err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, fmt.Errorf("invalid uuid: %w", err)
	}
	return u, nil
}
