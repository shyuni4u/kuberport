package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/auth"
)

func (h *Handlers) GetMe(c *gin.Context) {
	u, _ := auth.UserFrom(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{
		"subject": u.Subject,
		"email":   u.Email,
		"groups":  u.Groups,
	})
}
