package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"kuberport/internal/auth"
	"kuberport/internal/store"
	"kuberport/internal/template"
)

const defaultPageLimit = 50

type createReleaseReq struct {
	Template  string          `json:"template"  binding:"required"`
	Version   int             `json:"version"   binding:"required,min=1"`
	Cluster   string          `json:"cluster"   binding:"required"`
	Namespace string          `json:"namespace" binding:"required"`
	Name      string          `json:"name"      binding:"required,hostname_rfc1123"`
	Values    json.RawMessage `json:"values"    binding:"required"`
}

// resolveUser upserts the authenticated user and returns the DB record.
// NOTE: This does NOT participate in a database transaction. Callers inside
// Store.WithTx blocks (e.g. CreateTemplate) should use the transactional
// Queries directly instead of this helper.
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

// parsePagination extracts limit/offset from query params with defaults.
func parsePagination(c *gin.Context) (limit, offset int32) {
	limit = defaultPageLimit
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	if v := c.Query("offset"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n >= 0 {
			offset = int32(n)
		}
	}
	return
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

	// ReleaseID uses r.Name rather than DB UUID because the UUID is not known
	// until after INSERT. The release name is unique within (cluster, namespace)
	// and is used as the kuberport.io/release label for k8s resource tracking.
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
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			writeError(c, http.StatusConflict, "conflict", "release name already exists in this cluster/namespace")
			return
		}
		log.Printf("InsertRelease error: %v", err)
		writeError(c, http.StatusInternalServerError, "internal", "failed to create release")
		return
	}

	caBundle := cluster.CaBundle.String
	cli, err := h.deps.K8sFactory.NewWithToken(cluster.ApiUrl, caBundle, u.IDToken)
	if err != nil {
		rollbackCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if delErr := h.deps.Store.DeleteRelease(rollbackCtx, rel.ID); delErr != nil {
			log.Printf("rollback: failed to delete release %s from DB: %v", rel.Name, delErr)
		}
		writeError(c, http.StatusInternalServerError, "k8s-error", err.Error())
		return
	}
	if err := cli.ApplyAll(ctx, r.Namespace, rendered); err != nil {
		// Clean up partially created k8s resources with an independent context
		// and a timeout so cleanup doesn't hang indefinitely.
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if delErr := cli.DeleteByRelease(cleanupCtx, r.Namespace, r.Name); delErr != nil {
			log.Printf("rollback: failed to delete k8s resources for release %s: %v", r.Name, delErr)
		}
		if delErr := h.deps.Store.DeleteRelease(cleanupCtx, rel.ID); delErr != nil {
			log.Printf("rollback: failed to delete release %s from DB: %v", rel.Name, delErr)
		}
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}
	c.JSON(http.StatusCreated, rel)
}

func (h *Handlers) ListReleases(c *gin.Context) {
	ctx := c.Request.Context()
	limit, offset := parsePagination(c)

	if isAdmin(c) {
		rows, err := h.deps.Store.ListAllReleases(ctx, store.ListAllReleasesParams{
			Limit: limit, Offset: offset,
		})
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
	rows, err := h.deps.Store.ListReleasesForUser(ctx, store.ListReleasesForUserParams{
		CreatedByUserID: user.ID, Limit: limit, Offset: offset,
	})
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
