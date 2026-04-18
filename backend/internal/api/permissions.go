package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/auth"
	"kuberport/internal/store"
)

// ensureTemplateEditor loads the template by name from the URL and writes a
// 403 response if the caller can't mutate it. Returns (template, true) when
// allowed, or (zero, false) when the response has already been written.
//
// Rules:
// - Global template (owning_team_id null): caller must be kuberport-admin.
// - Team template: caller must be a team editor OR kuberport-admin.
func (h *Handlers) ensureTemplateEditor(c *gin.Context, name string) (store.Template, bool) {
	tpl, err := h.deps.Store.GetTemplateByName(c, name)
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "template "+name)
		return store.Template{}, false
	}
	u, _ := auth.UserFrom(c.Request.Context())

	if isKuberportAdmin(u) {
		return tpl, true
	}

	if !tpl.OwningTeamID.Valid {
		writeError(c, http.StatusForbidden, "rbac-denied", "global template requires kuberport-admin")
		return store.Template{}, false
	}

	user, err := h.deps.Store.UpsertUser(c, store.UpsertUserParams{
		OidcSubject: u.Subject,
		Email:       store.PgText(u.Email),
		DisplayName: store.PgText(u.Name),
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return store.Template{}, false
	}

	mem, err := h.deps.Store.GetTeamMembership(c, store.GetTeamMembershipParams{
		TeamID: tpl.OwningTeamID,
		UserID: user.ID,
	})
	if err != nil || mem.Role != "editor" {
		writeError(c, http.StatusForbidden, "rbac-denied", "team editor required")
		return store.Template{}, false
	}
	return tpl, true
}
