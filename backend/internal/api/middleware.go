package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"kuberport/internal/auth"
)

type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (auth.Claims, error)
}

func requireAuth(v TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			writeError(c, http.StatusUnauthorized, "unauthenticated", "missing bearer token")
			return
		}
		raw := strings.TrimPrefix(h, "Bearer ")
		claims, err := v.Verify(c.Request.Context(), raw)
		if err != nil {
			writeError(c, http.StatusUnauthorized, "unauthenticated", err.Error())
			return
		}
		ctx := auth.WithUser(c.Request.Context(), auth.RequestUser{Claims: claims, IDToken: raw})
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

func requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, _ := auth.UserFrom(c.Request.Context())
		for _, g := range u.Groups {
			if g == "kuberport-admin" {
				c.Next()
				return
			}
		}
		writeError(c, http.StatusForbidden, "rbac-denied", "admin group required")
	}
}
