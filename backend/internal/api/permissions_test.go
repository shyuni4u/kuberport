package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"kuberport/internal/api"
	"kuberport/internal/auth"
	"kuberport/internal/config"
	"kuberport/internal/store"
)

// TestPermissions_GlobalTemplate_NonAdminDenied verifies that non-admins
// cannot mutate global templates (those with owning_team_id NULL).
func TestPermissions_GlobalTemplate_NonAdminDenied(t *testing.T) {
	s := testStore(t)
	adminR := api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: s})
	userR := api.NewRouter(config.Config{}, api.Deps{Verifier: stubVerifier{}, Store: s})

	name := seedGlobalTemplate(t, adminR)

	// Non-admin attempts to deprecate the global template.
	w := do(t, userR, http.MethodPost, "/v1/templates/"+name+"/versions/1/deprecate", nil)
	require.Equal(t, http.StatusForbidden, w.Code)
}

// TestPermissions_TeamTemplate_EditorAllowed verifies that team editors
// can mutate templates owned by their team.
func TestPermissions_TeamTemplate_EditorAllowed(t *testing.T) {
	s := testStore(t)
	adminR := api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: s})

	// Create a user and add them as an editor to a team.
	suffix := randSuffix()
	userEmail := "alice-" + suffix + "@example.com"
	userSubject := "stub-" + suffix

	// Create the user in the database directly so they exist before adding to team
	_, err := s.UpsertUser(context.Background(), store.UpsertUserParams{
		OidcSubject: userSubject,
		Email:       store.PgText(userEmail),
		DisplayName: store.PgText("Alice"),
	})
	require.NoError(t, err)

	// Create a router with the user's credentials
	userVerifier := customVerifier{claims: auth.Claims{Subject: userSubject, Email: userEmail, Name: "Alice"}}
	userR := api.NewRouter(config.Config{}, api.Deps{Verifier: userVerifier, Store: s})

	// Create a team as admin and add alice as editor
	tid := createTeam(t, adminR, "team-"+randSuffix())
	addMember(t, adminR, tid, userEmail, "editor")

	// Create a team-owned template as admin
	name := seedTemplateOwnedBy(t, adminR, tid)
	publishV1(t, adminR, name)

	// Alice (editor) attempts to deprecate the template.
	w := do(t, userR, http.MethodPost, "/v1/templates/"+name+"/versions/1/deprecate", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
}

// TestPermissions_TeamTemplate_ViewerDenied verifies that team viewers
// cannot mutate templates owned by their team (only editors and admins can).
func TestPermissions_TeamTemplate_ViewerDenied(t *testing.T) {
	s := testStore(t)
	adminR := api.NewRouter(config.Config{}, api.Deps{Verifier: adminVerifier{}, Store: s})

	// Create a user and add them as a viewer to a team.
	suffix := randSuffix()
	userEmail := "bob-" + suffix + "@example.com"
	userSubject := "stub-viewer-" + suffix

	// Create the user in the database directly so they exist before adding to team
	_, err := s.UpsertUser(context.Background(), store.UpsertUserParams{
		OidcSubject: userSubject,
		Email:       store.PgText(userEmail),
		DisplayName: store.PgText("Bob"),
	})
	require.NoError(t, err)

	// Create a router with the user's credentials
	userVerifier := customVerifier{claims: auth.Claims{Subject: userSubject, Email: userEmail, Name: "Bob"}}
	userR := api.NewRouter(config.Config{}, api.Deps{Verifier: userVerifier, Store: s})

	// Create a team as admin and add bob as viewer
	tid := createTeam(t, adminR, "team-"+randSuffix())
	addMember(t, adminR, tid, userEmail, "viewer")

	// Create a team-owned template as admin
	name := seedTemplateOwnedBy(t, adminR, tid)
	publishV1(t, adminR, name)

	// Bob (viewer) attempts to deprecate the template.
	w := do(t, userR, http.MethodPost, "/v1/templates/"+name+"/versions/1/deprecate", nil)
	require.Equal(t, http.StatusForbidden, w.Code)
}
