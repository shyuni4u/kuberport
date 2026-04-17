package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTemplates_CreateListPublish(t *testing.T) {
	r := newTestRouterAdmin(t)
	name := "web-" + randSuffix()
	body := map[string]any{
		"name":           name,
		"display_name":   "Web Service",
		"description":    "simple",
		"tags":           []string{"web"},
		"resources_yaml": minimalResources,
		"ui_spec_yaml":   minimalUISpec,
	}
	raw, _ := json.Marshal(body)
	w := do(t, r, http.MethodPost, "/v1/templates", bytes.NewReader(raw))
	require.Equal(t, http.StatusCreated, w.Code, "create body=%s", w.Body.String())

	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	require.NotNil(t, created["template"])
	require.NotNil(t, created["version"])

	// list versions — should have 1 draft
	w = do(t, r, http.MethodGet, "/v1/templates/"+name+"/versions", nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"status":"draft"`)

	// get template by name
	w = do(t, r, http.MethodGet, "/v1/templates/"+name, nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), name)

	// get specific version
	w = do(t, r, http.MethodGet, "/v1/templates/"+name+"/versions/1", nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"status":"draft"`)

	// publish v1
	w = do(t, r, http.MethodPost, "/v1/templates/"+name+"/versions/1/publish", nil)
	require.Equal(t, http.StatusOK, w.Code, "publish body=%s", w.Body.String())
	require.Contains(t, w.Body.String(), `"status":"published"`)

	// republish should 409 (not in draft state)
	w = do(t, r, http.MethodPost, "/v1/templates/"+name+"/versions/1/publish", nil)
	require.Equal(t, http.StatusConflict, w.Code)
}

func TestTemplates_Create_InvalidYAMLReturns400(t *testing.T) {
	r := newTestRouterAdmin(t)
	body := map[string]any{
		"name":           "bad-" + randSuffix(),
		"display_name":   "Bad",
		"resources_yaml": "not: yaml: [",
		"ui_spec_yaml":   minimalUISpec,
	}
	raw, _ := json.Marshal(body)
	w := do(t, r, http.MethodPost, "/v1/templates", bytes.NewReader(raw))
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Contains(t, w.Body.String(), "validation-error")
}

func TestTemplates_Get_UnknownReturns404(t *testing.T) {
	r := newTestRouterAdmin(t)
	w := do(t, r, http.MethodGet, "/v1/templates/does-not-exist-"+randSuffix(), nil)
	require.Equal(t, http.StatusNotFound, w.Code)
}
