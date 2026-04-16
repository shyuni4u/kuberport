package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"kuberport/internal/api"
	"kuberport/internal/config"
)

func TestHealthz(t *testing.T) {
	r := api.NewRouter(config.Config{})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, `{"status":"ok"}`, w.Body.String())
}
