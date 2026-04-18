package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"kuberport/internal/auth"
	"kuberport/internal/store"
	"kuberport/internal/template"
)

type createTemplateReq struct {
	Name          string   `json:"name"           binding:"required"`
	DisplayName   string   `json:"display_name"   binding:"required"`
	Description   string   `json:"description"`
	Tags          []string `json:"tags"`
	AuthoringMode string   `json:"authoring_mode" binding:"required,oneof=yaml ui"`
	OwningTeamID  string   `json:"owning_team_id"` // uuid or ""

	// When mode=yaml:
	ResourcesYAML string `json:"resources_yaml"`
	UISpecYAML    string `json:"ui_spec_yaml"`

	// When mode=ui:
	UIState *template.UIModeTemplate `json:"ui_state"`

	MetadataYAML string `json:"metadata_yaml"`
}

func (h *Handlers) CreateTemplate(c *gin.Context) {
	var r createTemplateReq
	if err := c.ShouldBindJSON(&r); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	// authoring_mode / payload consistency.
	switch r.AuthoringMode {
	case "ui":
		if r.UIState == nil {
			writeError(c, http.StatusBadRequest, "validation-error", "authoring_mode=ui requires ui_state")
			return
		}
		if r.ResourcesYAML != "" || r.UISpecYAML != "" {
			writeError(c, http.StatusBadRequest, "validation-error", "authoring_mode=ui must not send resources_yaml/ui_spec_yaml")
			return
		}
		res, spec, err := template.SerializeUIMode(*r.UIState)
		if err != nil {
			writeError(c, http.StatusBadRequest, "validation-error", err.Error())
			return
		}
		r.ResourcesYAML = res
		r.UISpecYAML = spec
	case "yaml":
		if r.UIState != nil {
			writeError(c, http.StatusBadRequest, "validation-error", "authoring_mode=yaml must not send ui_state")
			return
		}
		if r.ResourcesYAML == "" || r.UISpecYAML == "" {
			writeError(c, http.StatusBadRequest, "validation-error", "authoring_mode=yaml requires resources_yaml + ui_spec_yaml")
			return
		}
	}

	// spec dry-run (both modes). Parses resources + ui-spec YAML; skips
	// required-field enforcement (those are checked at release deploy time).
	if err := template.ValidateSpec(r.ResourcesYAML, r.UISpecYAML); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)
	user, err := h.deps.Store.UpsertUser(ctx, store.UpsertUserParams{
		OidcSubject: u.Subject,
		Email:       store.PgText(u.Email),
		DisplayName: store.PgText(u.Name),
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	var owning pgtype.UUID
	if r.OwningTeamID != "" {
		parsed, err := uuid.Parse(r.OwningTeamID)
		if err != nil {
			writeError(c, http.StatusBadRequest, "validation-error", "owning_team_id must be a uuid")
			return
		}
		owning = pgtype.UUID{Bytes: parsed, Valid: true}
	}

	tpl, err := h.deps.Store.InsertTemplateV2(ctx, store.InsertTemplateV2Params{
		Name:         r.Name,
		DisplayName:  r.DisplayName,
		Description:  store.PgText(r.Description),
		Tags:         r.Tags,
		OwnerUserID:  user.ID,
		OwningTeamID: owning,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			writeError(c, http.StatusConflict, "conflict", "template name already exists")
			return
		}
		writeError(c, http.StatusConflict, "conflict", err.Error())
		return
	}

	var uiStateJSON []byte
	if r.UIState != nil {
		b, _ := json.Marshal(r.UIState)
		uiStateJSON = b
	}

	ver, err := h.deps.Store.InsertTemplateVersionV2(ctx, store.InsertTemplateVersionV2Params{
		TemplateID:      tpl.ID,
		Version:         1,
		ResourcesYaml:   r.ResourcesYAML,
		UiSpecYaml:      r.UISpecYAML,
		MetadataYaml:    store.PgText(r.MetadataYAML),
		Status:          "draft",
		CreatedByUserID: user.ID,
		AuthoringMode:   r.AuthoringMode,
		UiStateJson:     uiStateJSON,
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"template":       tpl,
		"version":        ver,
		"resources_yaml": r.ResourcesYAML,
		"ui_spec_yaml":   r.UISpecYAML,
	})
}

func (h *Handlers) ListTemplates(c *gin.Context) {
	rows, err := h.deps.Store.ListTemplates(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if rows == nil {
		rows = []store.ListTemplatesRow{}
	}
	c.JSON(http.StatusOK, gin.H{"templates": rows})
}

func (h *Handlers) GetTemplate(c *gin.Context) {
	t, err := h.deps.Store.GetTemplateByName(c.Request.Context(), c.Param("name"))
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "template")
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *Handlers) ListTemplateVersions(c *gin.Context) {
	vs, err := h.deps.Store.ListTemplateVersions(c.Request.Context(), c.Param("name"))
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if vs == nil {
		vs = []store.TemplateVersion{}
	}
	c.JSON(http.StatusOK, gin.H{"versions": vs})
}

func (h *Handlers) GetTemplateVersion(c *gin.Context) {
	v64, err := strconv.ParseInt(c.Param("v"), 10, 32)
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", "version must be integer")
		return
	}
	tv, err := h.deps.Store.GetTemplateVersion(c.Request.Context(), store.GetTemplateVersionParams{
		Name:    c.Param("name"),
		Version: int32(v64),
	})
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "template version")
		return
	}
	c.JSON(http.StatusOK, tv)
}

func (h *Handlers) PublishVersion(c *gin.Context) {
	ctx := c.Request.Context()
	v64, err := strconv.ParseInt(c.Param("v"), 10, 32)
	if err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", "version must be integer")
		return
	}
	existing, err := h.deps.Store.GetTemplateVersion(ctx, store.GetTemplateVersionParams{
		Name:    c.Param("name"),
		Version: int32(v64),
	})
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "template version")
		return
	}

	var published store.TemplateVersion
	var notDraft bool
	err = h.deps.Store.WithTx(ctx, func(q *store.Queries) error {
		pub, err := q.PublishTemplateVersion(ctx, existing.ID)
		if err != nil {
			notDraft = true
			return err
		}
		published = pub
		return q.UpdateTemplateCurrentVersion(ctx, store.UpdateTemplateCurrentVersionParams{
			ID:               existing.TemplateID,
			CurrentVersionID: pub.ID,
		})
	})
	if err != nil {
		if notDraft {
			writeError(c, http.StatusConflict, "conflict", "version not in draft state")
			return
		}
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, published)
}
