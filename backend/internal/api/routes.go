package api

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/config"
	"kuberport/internal/k8s"
	"kuberport/internal/store"
)

// K8sApplier applies, deletes, or inspects resources on a k8s cluster.
type K8sApplier interface {
	ApplyAll(ctx context.Context, ns string, yaml []byte) error
	DeleteByRelease(ctx context.Context, namespace, release string) error
	ListInstances(ctx context.Context, namespace, release string) ([]k8s.Instance, error)
}

// K8sClientFactory creates per-request k8s clients using the caller's token.
type K8sClientFactory interface {
	NewWithToken(apiURL, caBundle, bearer string) (K8sApplier, error)
}

type Deps struct {
	Verifier   TokenVerifier
	Store      *store.Store
	K8sFactory K8sClientFactory
}

type Handlers struct {
	deps    Deps
	openapi *openapiProxy
}

func NewRouter(cfg config.Config, deps Deps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	h := &Handlers{deps: deps, openapi: newOpenAPIProxy(cfg.OpenAPICacheMax)}
	v := r.Group("/v1", requireAuth(deps.Verifier))
	v.GET("/me", h.GetMe)
	v.GET("/clusters", h.ListClusters)
	v.POST("/clusters", requireAdmin(), h.CreateCluster)
	v.GET("/clusters/:name/openapi", h.GetOpenAPIIndex)
	v.GET("/clusters/:name/openapi/*gv", h.GetOpenAPIGroupVersion)
	v.POST("/clusters/:name/openapi/refresh", h.RefreshOpenAPI)
	v.GET("/templates", h.ListTemplates)
	v.POST("/templates", requireAdmin(), h.CreateTemplate)
	v.GET("/templates/:name", h.GetTemplate)
	v.GET("/templates/:name/versions", h.ListTemplateVersions)
	v.GET("/templates/:name/versions/:v", h.GetTemplateVersion)
	v.POST("/templates/:name/versions/:v/publish", requireAdmin(), h.PublishVersion)
	v.GET("/releases", h.ListReleases)
	v.POST("/releases", h.CreateRelease)
	v.GET("/releases/:id", h.GetRelease)
	v.DELETE("/releases/:id", h.DeleteRelease)
	v.GET("/teams", h.ListTeams)
	v.POST("/teams", requireAdmin(), h.CreateTeam)
	v.GET("/teams/:id/members", h.ListTeamMembers)
	v.POST("/teams/:id/members", requireAdmin(), h.AddTeamMember)
	v.DELETE("/teams/:id/members/:user_id", requireAdmin(), h.RemoveTeamMember)
	return r
}
