package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/config"
)

func NewRouter(cfg config.Config) *gin.Engine {
	_ = cfg
	r := gin.New()
	r.Use(gin.Recovery())
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	return r
}
