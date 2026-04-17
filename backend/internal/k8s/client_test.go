package k8s_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"kuberport/internal/k8s"
)

// TestApplyAll_IntegrationWithKind is opt-in: skipped unless KIND_API is set.
// Point KIND_API at a kind cluster's API URL and DEX_TOKEN at a bearer token
// with permission to create ConfigMaps in the default namespace.
func TestApplyAll_IntegrationWithKind(t *testing.T) {
	apiURL := os.Getenv("KIND_API")
	if apiURL == "" {
		t.Skip("KIND_API not set; skipping kind integration test")
	}

	cli, err := k8s.NewWithToken(apiURL, "", os.Getenv("DEX_TOKEN"))
	require.NoError(t, err)

	suffix := time.Now().Format("150405.000000")
	name := "kuberport-t12-" + suffix
	yaml := []byte(fmt.Sprintf(`apiVersion: v1
kind: ConfigMap
metadata:
  name: %s
  namespace: default
data:
  hello: world
`, name))

	ctx := context.Background()
	require.NoError(t, cli.ApplyAll(ctx, "default", yaml), "first apply")
	require.NoError(t, cli.ApplyAll(ctx, "default", yaml), "second apply (SSA idempotency)")
}
