package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/auth"
	"kuberport/internal/store"
)

// GetMe returns the caller's claims and also serves as the single write-on-read
// warm-up path: every /v1/me hit upserts the user row so subsequent read-only
// endpoints (ListTeams, ListTeamMembers, ensureTemplateEditor) can look the
// caller up by oidc_subject without touching the DB in write mode.
func (h *Handlers) GetMe(c *gin.Context) {
	u, ok := auth.UserFrom(c.Request.Context())
	if !ok {
		writeError(c, http.StatusUnauthorized, "unauthenticated", "user not in context")
		return
	}
	if _, err := h.deps.Store.UpsertUser(c, store.UpsertUserParams{
		OidcSubject: u.Subject,
		Email:       store.PgText(u.Email),
		DisplayName: store.PgText(u.Name),
	}); err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"subject": u.Subject,
		"email":   u.Email,
		"groups":  u.Groups,
	})
}
