package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"kuberport/internal/store"
)

func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://kuberport:kuberport@localhost:5432/kuberport?sslmode=disable"
	}
	return dsn
}

func pgText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

func TestUpsertUser(t *testing.T) {
	ctx := context.Background()
	s, err := store.NewStore(ctx, testDSN(t))
	require.NoError(t, err)
	defer s.Close()

	u, err := s.UpsertUser(ctx, store.UpsertUserParams{
		OidcSubject: "test-sub-" + time.Now().Format("150405.000000"),
		Email:       pgText("alice@example.com"),
		DisplayName: pgText("Alice"),
	})
	require.NoError(t, err)
	require.Equal(t, "alice@example.com", u.Email.String)
}

func TestInsertClusterAndTemplate(t *testing.T) {
	ctx := context.Background()
	s, err := store.NewStore(ctx, testDSN(t))
	require.NoError(t, err)
	defer s.Close()

	stamp := time.Now().Format("150405.000000")

	u, err := s.UpsertUser(ctx, store.UpsertUserParams{
		OidcSubject: "owner-" + stamp,
		Email:       pgText("owner@example.com"),
		DisplayName: pgText("Owner"),
	})
	require.NoError(t, err)

	c, err := s.InsertCluster(ctx, store.InsertClusterParams{
		Name:          "test-" + stamp,
		DisplayName:   pgText("Test Cluster"),
		ApiUrl:        "https://kubernetes.default:443",
		OidcIssuerUrl: "http://localhost:5556",
	})
	require.NoError(t, err)
	require.NotZero(t, c.ID)

	tpl, err := s.InsertTemplate(ctx, store.InsertTemplateParams{
		Name:        "web-" + stamp,
		DisplayName: "Web",
		OwnerUserID: u.ID,
	})
	require.NoError(t, err)
	require.NotZero(t, tpl.ID)
}
