package api_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"kuberport/internal/api"
	"kuberport/internal/config"
)

const minimalResources = `
apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: placeholder
`

const minimalUISpec = `
fields:
  - path: Deployment[web].spec.replicas
    label: "Replicas"
    type: integer
    min: 1
    max: 20
    default: 1
`

func newTestRouterAdmin(t *testing.T) http.Handler {
	t.Helper()
	return api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: testStore(t)})
}

func do(t *testing.T, r http.Handler, method, path string, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Authorization", "Bearer x")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
