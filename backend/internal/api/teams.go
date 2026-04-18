package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kuberport/internal/auth"
	"kuberport/internal/store"
)

type createTeamReq struct {
	Name        string `json:"name" binding:"required,min=1"`
	DisplayName string `json:"display_name"`
}

func (h *Handlers) CreateTeam(c *gin.Context) {
	var r createTeamReq
	if err := c.ShouldBindJSON(&r); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}
	team, err := h.deps.Store.InsertTeam(c, store.InsertTeamParams{
		Name:        r.Name,
		DisplayName: store.PgText(r.DisplayName),
	})
	if err != nil {
		writeError(c, http.StatusConflict, "conflict", err.Error())
		return
	}
	c.JSON(http.StatusCreated, team)
}

func (h *Handlers) ListTeams(c *gin.Context) {
	u, _ := auth.UserFrom(c.Request.Context())

	if isKuberportAdmin(u) {
		all, err := h.deps.Store.ListTeams(c)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"teams": all})
		return
	}

	user, err := h.deps.Store.UpsertUser(c, store.UpsertUserParams{
		OidcSubject: u.Subject,
		Email:       store.PgText(u.Email),
		DisplayName: store.PgText(u.Name),
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	mine, err := h.deps.Store.ListTeamsForUser(c, user.ID)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"teams": mine})
}

// isKuberportAdmin centralises the group check used from multiple handlers.
func isKuberportAdmin(u auth.RequestUser) bool {
	for _, g := range u.Groups {
		if g == "kuberport-admin" {
			return true
		}
	}
	return false
}
