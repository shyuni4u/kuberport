//go:build e2e
// +build e2e

package e2e_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const (
	apiBase  = "http://localhost:8080"
	dexToken = "http://localhost:5556/token"
)

// fetchDexIDToken uses the dex password grant to get an id_token.
func fetchDexIDToken(t *testing.T, email, password string) string {
	t.Helper()
	form := url.Values{}
	form.Set("grant_type", "password")
	form.Set("client_id", "kuberport")
	form.Set("client_secret", "local-dev-secret")
	form.Set("username", email)
	form.Set("password", password)
	form.Set("scope", "openid email profile groups")
	resp, err := http.Post(dexToken, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		IDToken string `json:"id_token"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	require.NotEmpty(t, out.IDToken)
	return out.IDToken
}

func doAPI(t *testing.T, token, method, path string, body any) *http.Response {
	t.Helper()
	var buf io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, apiBase+path, buf)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	return resp
}

// TestE2E_HappyPath exercises the full vertical slice:
//   register cluster (admin) → create + publish template (admin) →
//   deploy release (user) → list → get (poll until healthy) → delete
//
// Prerequisites:
//   - docker compose up (postgres + dex)
//   - Go API running on :8080
//   - KBP_KIND_API set to the kind API server URL (otherwise the test is skipped)
//   - kubectl configured for the same kind cluster
func TestE2E_HappyPath(t *testing.T) {
	if os.Getenv("KBP_KIND_API") == "" {
		t.Skip("KBP_KIND_API not set; skipping e2e (requires kind cluster)")
	}

	// Ensure docker compose is up
	require.NoError(t, exec.Command("docker", "compose",
		"-f", "../../deploy/docker/docker-compose.yml", "up", "-d").Run())

	// Start API server in background
	cmd := exec.Command("go", "run", "../cmd/server")
	cmd.Env = append(os.Environ(),
		"LISTEN_ADDR=:8080",
		"DATABASE_URL=postgres://kuberport:kuberport@localhost:5432/kuberport?sslmode=disable",
		"OIDC_ISSUER=http://localhost:5556",
		"OIDC_AUDIENCE=kuberport",
	)
	require.NoError(t, cmd.Start())
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}()
	time.Sleep(2 * time.Second)

	adminTok := fetchDexIDToken(t, "admin@example.com", "admin")
	userTok := fetchDexIDToken(t, "alice@example.com", "alice")

	// 1. Register cluster (admin)
	resp := doAPI(t, adminTok, http.MethodPost, "/v1/clusters", map[string]any{
		"name":            "kind",
		"api_url":         os.Getenv("KBP_KIND_API"),
		"oidc_issuer_url": "http://localhost:5556",
	})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	resp.Body.Close()

	// 2. Create template (admin) and publish v1
	resp = doAPI(t, adminTok, http.MethodPost, "/v1/templates", map[string]any{
		"name":           "web-e2e",
		"display_name":   "Web E2E",
		"resources_yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: web}\nspec:\n  replicas: 1\n  selector: {matchLabels: {app: web}}\n  template:\n    metadata: {labels: {app: web}}\n    spec:\n      containers:\n        - name: app\n          image: nginx:1.25\n",
		"ui_spec_yaml":   "fields:\n  - path: Deployment[web].spec.replicas\n    label: replicas\n    type: integer\n    min: 1\n    max: 5\n",
	})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	resp.Body.Close()

	resp = doAPI(t, adminTok, http.MethodPost, "/v1/templates/web-e2e/versions/1/publish", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// 3. User deploys
	resp = doAPI(t, userTok, http.MethodPost, "/v1/releases", map[string]any{
		"template":  "web-e2e",
		"version":   1,
		"cluster":   "kind",
		"namespace": "default",
		"name":      "my-api",
		"values":    map[string]any{"Deployment[web].spec.replicas": 2},
	})
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var rel struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&rel))
	resp.Body.Close()

	// 4. Poll until healthy
	require.Eventually(t, func() bool {
		r := doAPI(t, userTok, http.MethodGet, "/v1/releases/"+rel.ID, nil)
		defer r.Body.Close()
		body, _ := io.ReadAll(r.Body)
		return r.StatusCode == http.StatusOK && bytes.Contains(body, []byte(`"status":"healthy"`))
	}, 60*time.Second, 2*time.Second, "release never became healthy")

	// 5. User lists releases
	resp = doAPI(t, userTok, http.MethodGet, "/v1/releases", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	require.Contains(t, string(body), "my-api")

	// 6. Delete release and confirm k8s resources are gone
	resp = doAPI(t, userTok, http.MethodDelete, "/v1/releases/"+rel.ID, nil)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	resp.Body.Close()

	// Using kubectl directly to confirm. kubectl must be configured for KBP_KIND_API.
	out, err := exec.Command("kubectl", "-n", "default", "get", "deployments",
		"-l", "kuberport.io/release=my-api", "--no-headers").CombinedOutput()
	require.NoError(t, err)
	require.Empty(t, strings.TrimSpace(string(out)), "deployment should have been deleted")

	fmt.Println("e2e happy path passed")
}
