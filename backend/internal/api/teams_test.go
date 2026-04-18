package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"kuberport/internal/api"
	"kuberport/internal/config"
)

func TestTeams_Create_RequiresAdmin(t *testing.T) {
	r := api.NewRouter(config.Config{}, api.Deps{Verifier: stubVerifier{}, Store: testStore(t)})
	req := httptest.NewRequest(http.MethodPost, "/v1/teams",
		bytes.NewReader([]byte(`{"name":"plat-`+randSuffix()+`","display_name":"Platform"}`)))
	req.Header.Set("Authorization", "Bearer x")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestTeams_Create_AdminSucceeds(t *testing.T) {
	r := api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: testStore(t)})
	name := "plat-" + randSuffix()
	req := httptest.NewRequest(http.MethodPost, "/v1/teams",
		bytes.NewReader([]byte(`{"name":"`+name+`","display_name":"Platform"}`)))
	req.Header.Set("Authorization", "Bearer x")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var got map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Equal(t, name, got["name"])
	require.NotEmpty(t, got["id"])
}

func TestTeams_List_NonAdminSeesOnlyTheirTeams(t *testing.T) {
	s := testStore(t)

	// Seed one team as admin; alice is not added.
	adminR := api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: s})
	teamName := "visible-" + randSuffix()
	w := do(t, adminR, http.MethodPost, "/v1/teams",
		bytes.NewReader([]byte(`{"name":"`+teamName+`","display_name":"Vis"}`)))
	require.Equal(t, http.StatusCreated, w.Code)

	// Alice lists teams — empty (she's not a member of any).
	userR := api.NewRouter(config.Config{}, api.Deps{Verifier: stubVerifier{}, Store: s})
	w = do(t, userR, http.MethodGet, "/v1/teams", nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.NotContains(t, w.Body.String(), teamName)
}
