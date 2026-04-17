package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/config"
)

type Deps struct {
	Verifier TokenVerifier
	// Store, K8sFactory added in later tasks
}

type Handlers struct {
	deps Deps
}

func NewRouter(cfg config.Config, deps Deps) *gin.Engine {
	_ = cfg
	r := gin.New()
	r.Use(gin.Recovery())
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	h := &Handlers{deps: deps}
	v := r.Group("/v1", requireAuth(deps.Verifier))
	v.GET("/me", h.GetMe)
	return r
}
