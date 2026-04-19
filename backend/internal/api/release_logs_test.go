package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// TestStreamReleaseLogs_NotFound: unknown release id returns 404. The
// response must NOT have an event-stream content type — error path
// comes before SSE upgrade.
func TestStreamReleaseLogs_NotFound(t *testing.T) {
	r, _ := newTestRouterWithK8s(t)

	w := do(t, r, http.MethodGet, "/v1/releases/00000000-0000-0000-0000-000000000000/logs", nil)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
	if strings.HasPrefix(w.Header().Get("Content-Type"), "text/event-stream") {
		t.Fatalf("error response should not be event-stream; got %q", w.Header().Get("Content-Type"))
	}
}

// TestStreamReleaseLogs_BadID: malformed id returns 400.
func TestStreamReleaseLogs_BadID(t *testing.T) {
	r, _ := newTestRouterWithK8s(t)

	w := do(t, r, http.MethodGet, "/v1/releases/not-a-uuid/logs", nil)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}
