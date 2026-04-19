package api

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"kuberport/internal/auth"
	"kuberport/internal/store"
)

// ensureTeamEditor writes a 403/500 response and returns false unless the
// caller is kuberport-admin or an editor of the given team. System errors
// (DB outage etc.) resolve to 500, not a misleading 403.
func (h *Handlers) ensureTeamEditor(c *gin.Context, teamID pgtype.UUID) bool {
	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)

	if isKuberportAdmin(u) {
		return true
	}

	caller, err := h.deps.Store.GetUserByOidcSubject(ctx, u.Subject)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusForbidden, "rbac-denied", "team editor required")
			return false
		}
		log.Printf("ensureTeamEditor: GetUserByOidcSubject: %v", err)
		writeError(c, http.StatusInternalServerError, "internal", "failed to resolve caller")
		return false
	}
	mem, err := h.deps.Store.GetTeamMembership(ctx, store.GetTeamMembershipParams{
		TeamID: teamID,
		UserID: caller.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusForbidden, "rbac-denied", "team editor required")
			return false
		}
		log.Printf("ensureTeamEditor: GetTeamMembership: %v", err)
		writeError(c, http.StatusInternalServerError, "internal", "failed to resolve membership")
		return false
	}
	if mem.Role != "editor" {
		writeError(c, http.StatusForbidden, "rbac-denied", "team editor required")
		return false
	}
	return true
}

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

	if !h.ensureTeamEditor(c, tpl.OwningTeamID) {
		return store.Template{}, false
	}
	return tpl, true
}
