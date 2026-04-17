package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"

	"kuberport/internal/auth"
	"kuberport/internal/store"
	"kuberport/internal/template"
)

type createTemplateReq struct {
	Name          string   `json:"name"           binding:"required"`
	DisplayName   string   `json:"display_name"   binding:"required"`
	Description   string   `json:"description"`
	Tags          []string `json:"tags"`
	ResourcesYAML string   `json:"resources_yaml" binding:"required"`
	UISpecYAML    string   `json:"ui_spec_yaml"   binding:"required"`
	MetadataYAML  string   `json:"metadata_yaml"`
}

func (h *Handlers) CreateTemplate(c *gin.Context) {
	var r createTemplateReq
	if err := c.ShouldBindJSON(&r); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}
	if err := template.ValidateSpec(r.ResourcesYAML, r.UISpecYAML); err != nil {
		writeError(c, http.StatusBadRequest, "validation-error", err.Error())
		return
	}

	ctx := c.Request.Context()
	u, _ := auth.UserFrom(ctx)

	var tpl store.Template
	var tv store.TemplateVersion
	err := h.deps.Store.WithTx(ctx, func(q *store.Queries) error {
		user, err := q.UpsertUser(ctx, store.UpsertUserParams{
			OidcSubject: u.Subject,
			Email:       store.PgText(u.Email),
			DisplayName: store.PgText(u.Name),
		})
		if err != nil {
			return err
		}
		tpl, err = q.InsertTemplate(ctx, store.InsertTemplateParams{
			Name:        r.Name,
			DisplayName: r.DisplayName,
			Description: store.PgText(r.Description),
			Tags:        r.Tags,
			OwnerUserID: user.ID,
		})
		if err != nil {
			return err
		}
		tv, err = q.InsertTemplateVersion(ctx, store.InsertTemplateVersionParams{
			TemplateID:      tpl.ID,
			Version:         1,
			ResourcesYaml:   r.ResourcesYAML,
			UiSpecYaml:      r.UISpecYAML,
			MetadataYaml:    store.PgText(r.MetadataYAML),
			Status:          "draft",
			CreatedByUserID: user.ID,
		})
		return err
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			writeError(c, http.StatusConflict, "conflict", "template name already exists")
			return
		}
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusCreated, gin.H{"template": tpl, "version": tv})
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
