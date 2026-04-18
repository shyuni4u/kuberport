package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"kuberport/internal/api"
	"kuberport/internal/config"
	"kuberport/internal/store"
)

// fakeK8sApplier records calls for test assertions.
type fakeK8sApplier struct {
	applied [][]byte
	deleted []string
}

func (f *fakeK8sApplier) ApplyAll(_ context.Context, _ string, y []byte) error {
	f.applied = append(f.applied, y)
	return nil
}

func (f *fakeK8sApplier) DeleteByRelease(_ context.Context, _, release string) error {
	f.deleted = append(f.deleted, release)
	return nil
}

// fakeK8sFactory returns the same fakeK8sApplier for every call.
type fakeK8sFactory struct {
	applier *fakeK8sApplier
}

func (f *fakeK8sFactory) NewWithToken(_, _, _ string) (api.K8sApplier, error) {
	return f.applier, nil
}

func newTestRouterWithK8s(t *testing.T) (http.Handler, *fakeK8sApplier) {
	t.Helper()
	applier := &fakeK8sApplier{}
	factory := &fakeK8sFactory{applier: applier}
	r := api.NewRouter(config.Config{}, api.Deps{
		Verifier:   adminVerifier{},
		Store:      testStore(t),
		K8sFactory: factory,
	})
	return r, applier
}

// newTestRouterUserWithK8s creates a router authenticated as a non-admin user.
func newTestRouterUserWithK8s(t *testing.T, s *store.Store, applier *fakeK8sApplier) http.Handler {
	t.Helper()
	factory := &fakeK8sFactory{applier: applier}
	return api.NewRouter(config.Config{}, api.Deps{
		Verifier:   stubVerifier{}, // non-admin
		Store:      s,
		K8sFactory: factory,
	})
}

func seedCluster(t *testing.T, r http.Handler) string {
	t.Helper()
	name := "cluster-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"name":           name,
		"api_url":        "https://k8s.example.com",
		"oidc_issuer_url": "http://localhost:5556",
		"ca_bundle":      "fake-ca",
	})
	w := do(t, r, http.MethodPost, "/v1/clusters", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code, "seed cluster: %s", w.Body.String())
	return name
}

func seedPublishedTemplate(t *testing.T, r http.Handler) string {
	t.Helper()
	name := "tpl-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"name":           name,
		"display_name":   "Test Template",
		"resources_yaml": minimalResources,
		"ui_spec_yaml":   minimalUISpec,
	})
	w := do(t, r, http.MethodPost, "/v1/templates", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code, "seed template: %s", w.Body.String())

	w = do(t, r, http.MethodPost, "/v1/templates/"+name+"/versions/1/publish", nil)
	require.Equal(t, http.StatusOK, w.Code, "publish: %s", w.Body.String())
	return name
}

func TestReleases_CreateAndList(t *testing.T) {
	r, fk := newTestRouterWithK8s(t)
	clusterName := seedCluster(t, r)
	tplName := seedPublishedTemplate(t, r)

	body, _ := json.Marshal(map[string]any{
		"template":  tplName,
		"version":   1,
		"cluster":   clusterName,
		"namespace": "default",
		"name":      "my-api-" + randSuffix(),
		"values": map[string]any{
			"Deployment[web].spec.replicas": 2,
		},
	})

	w := do(t, r, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code, "create: %s", w.Body.String())
	require.Len(t, fk.applied, 1)

	w = do(t, r, http.MethodGet, "/v1/releases", nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"my-api-`)
}

func TestReleases_GetByID(t *testing.T) {
	r, _ := newTestRouterWithK8s(t)
	clusterName := seedCluster(t, r)
	tplName := seedPublishedTemplate(t, r)

	relName := "get-rel-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"template":  tplName,
		"version":   1,
		"cluster":   clusterName,
		"namespace": "default",
		"name":      relName,
		"values": map[string]any{
			"Deployment[web].spec.replicas": 1,
		},
	})
	w := do(t, r, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code)

	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	id := created["id"].(string)

	w = do(t, r, http.MethodGet, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), relName)
}

func TestReleases_Delete(t *testing.T) {
	r, fk := newTestRouterWithK8s(t)
	clusterName := seedCluster(t, r)
	tplName := seedPublishedTemplate(t, r)

	relName := "del-rel-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"template":  tplName,
		"version":   1,
		"cluster":   clusterName,
		"namespace": "default",
		"name":      relName,
		"values": map[string]any{
			"Deployment[web].spec.replicas": 1,
		},
	})
	w := do(t, r, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code)

	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	id := created["id"].(string)

	w = do(t, r, http.MethodDelete, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"deleted":true`)
	require.Len(t, fk.deleted, 1)
	require.Equal(t, relName, fk.deleted[0])

	// get after delete → 404
	w = do(t, r, http.MethodGet, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestReleases_Get_NonOwnerReturns403(t *testing.T) {
	s := testStore(t)
	applier := &fakeK8sApplier{}

	// admin creates a release
	adminRouter := api.NewRouter(config.Config{}, api.Deps{
		Verifier: adminVerifier{}, Store: s,
		K8sFactory: &fakeK8sFactory{applier: applier},
	})
	clusterName := seedCluster(t, adminRouter)
	tplName := seedPublishedTemplate(t, adminRouter)

	relName := "owned-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"template": tplName, "version": 1,
		"cluster": clusterName, "namespace": "default",
		"name": relName, "values": map[string]any{"Deployment[web].spec.replicas": 1},
	})
	w := do(t, adminRouter, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code)

	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	id := created["id"].(string)

	// non-admin user tries to GET → 403
	userRouter := newTestRouterUserWithK8s(t, s, applier)
	w = do(t, userRouter, http.MethodGet, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusForbidden, w.Code)
	require.Contains(t, w.Body.String(), "not the release owner")

	// admin can still GET → 200
	w = do(t, adminRouter, http.MethodGet, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestReleases_Delete_NonOwnerReturns403(t *testing.T) {
	s := testStore(t)
	applier := &fakeK8sApplier{}

	adminRouter := api.NewRouter(config.Config{}, api.Deps{
		Verifier: adminVerifier{}, Store: s,
		K8sFactory: &fakeK8sFactory{applier: applier},
	})
	clusterName := seedCluster(t, adminRouter)
	tplName := seedPublishedTemplate(t, adminRouter)

	relName := "nodelete-" + randSuffix()
	body, _ := json.Marshal(map[string]any{
		"template": tplName, "version": 1,
		"cluster": clusterName, "namespace": "default",
		"name": relName, "values": map[string]any{"Deployment[web].spec.replicas": 1},
	})
	w := do(t, adminRouter, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code)

	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	id := created["id"].(string)

	// non-admin user tries to DELETE → 403
	userRouter := newTestRouterUserWithK8s(t, s, applier)
	w = do(t, userRouter, http.MethodDelete, "/v1/releases/"+id, nil)
	require.Equal(t, http.StatusForbidden, w.Code)
	require.Contains(t, w.Body.String(), "not the release owner")
}

func TestReleases_List_NonAdminSeesOnlyOwn(t *testing.T) {
	s := testStore(t)
	applier := &fakeK8sApplier{}

	// admin creates a release
	adminRouter := api.NewRouter(config.Config{}, api.Deps{
		Verifier: adminVerifier{}, Store: s,
		K8sFactory: &fakeK8sFactory{applier: applier},
	})
	clusterName := seedCluster(t, adminRouter)
	tplName := seedPublishedTemplate(t, adminRouter)

	body, _ := json.Marshal(map[string]any{
		"template": tplName, "version": 1,
		"cluster": clusterName, "namespace": "default",
		"name": "admin-rel-" + randSuffix(),
		"values": map[string]any{"Deployment[web].spec.replicas": 1},
	})
	w := do(t, adminRouter, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusCreated, w.Code)

	// admin list → sees the release
	w = do(t, adminRouter, http.MethodGet, "/v1/releases", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var adminList map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &adminList))
	require.NotEmpty(t, adminList["releases"])

	// non-admin list → sees 0 releases (different user)
	userRouter := newTestRouterUserWithK8s(t, s, applier)
	w = do(t, userRouter, http.MethodGet, "/v1/releases", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var userList map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &userList))
	require.Empty(t, userList["releases"])
}

func TestReleases_Create_InvalidNameReturns400(t *testing.T) {
	r, _ := newTestRouterWithK8s(t)
	clusterName := seedCluster(t, r)
	tplName := seedPublishedTemplate(t, r)

	body, _ := json.Marshal(map[string]any{
		"template":  tplName,
		"version":   1,
		"cluster":   clusterName,
		"namespace": "default",
		"name":      "INVALID_NAME!",
		"values":    map[string]any{"Deployment[web].spec.replicas": 1},
	})
	w := do(t, r, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Contains(t, w.Body.String(), "validation-error")
}

func TestReleases_Create_UnpublishedReturns409(t *testing.T) {
	r, _ := newTestRouterWithK8s(t)
	clusterName := seedCluster(t, r)

	// create template but don't publish
	tplName := "draft-" + randSuffix()
	tplBody, _ := json.Marshal(map[string]any{
		"name":           tplName,
		"display_name":   "Draft Only",
		"resources_yaml": minimalResources,
		"ui_spec_yaml":   minimalUISpec,
	})
	w := do(t, r, http.MethodPost, "/v1/templates", bytes.NewReader(tplBody))
	require.Equal(t, http.StatusCreated, w.Code)

	body, _ := json.Marshal(map[string]any{
		"template":  tplName,
		"version":   1,
		"cluster":   clusterName,
		"namespace": "default",
		"name":      "fail-" + randSuffix(),
		"values":    map[string]any{},
	})
	w = do(t, r, http.MethodPost, "/v1/releases", bytes.NewReader(body))
	require.Equal(t, http.StatusConflict, w.Code)
	require.Contains(t, w.Body.String(), "not published")
}
