package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"kuberport/internal/auth"
)

// getDexToken fetches an id_token from the local dex using the password grant.
// Requires `docker compose -f deploy/docker/docker-compose.yml up -d` with
// enablePasswordDB: true so alice@example.com can authenticate.
func getDexToken(t *testing.T) string {
	t.Helper()
	form := url.Values{}
	form.Set("grant_type", "password")
	form.Set("client_id", "kuberport")
	form.Set("client_secret", "local-dev-secret")
	form.Set("username", "alice@example.com")
	form.Set("password", "alice")
	form.Set("scope", "openid email profile")

	resp, err := http.PostForm("http://localhost:5556/token", form)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode, "dex returned non-200 from /token")

	var body struct {
		IDToken string `json:"id_token"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.IDToken, "dex /token response had no id_token")
	return body.IDToken
}

func TestVerifier_Verify(t *testing.T) {
	if os.Getenv("SKIP_OIDC") != "" {
		t.Skip("SKIP_OIDC set")
	}
	ctx := context.Background()
	v, err := auth.NewVerifier(ctx, "http://localhost:5556", "kuberport")
	require.NoError(t, err)

	token := getDexToken(t)
	require.False(t, strings.HasPrefix(token, "<"))

	claims, err := v.Verify(ctx, token)
	require.NoError(t, err)
	require.Equal(t, "alice@example.com", claims.Email)
}
