package main

import (
	"context"
	"log"
	"os"

	"kuberport/internal/api"
	"kuberport/internal/auth"
	"kuberport/internal/config"
	"kuberport/internal/k8s"
	"kuberport/internal/store"
)

// k8sFactory adapts the k8s package constructors to api.K8sClientFactory.
// Falls back to insecure TLS when no CA bundle is registered for the cluster
// (local dev / kind). Production clusters must register a CA bundle.
type k8sFactory struct{}

func (k8sFactory) NewWithToken(apiURL, caBundle, bearer string) (api.K8sApplier, error) {
	if caBundle == "" {
		return k8s.NewInsecureWithToken(apiURL, bearer)
	}
	return k8s.NewWithToken(apiURL, caBundle, bearer)
}

func main() {
	cfg := config.Config{
		ListenAddr:          getenv("LISTEN_ADDR", ":8080"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		OIDCIssuer:          os.Getenv("OIDC_ISSUER"),
		OIDCAudience:        os.Getenv("OIDC_AUDIENCE"),
		AppEncryptionKeyB64: os.Getenv("APP_ENCRYPTION_KEY_B64"),
	}

	if cfg.OIDCIssuer == "" || cfg.OIDCAudience == "" {
		log.Fatal("OIDC_ISSUER and OIDC_AUDIENCE are required (local dev: OIDC_ISSUER=http://localhost:5556 OIDC_AUDIENCE=kuberport)")
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required (local dev: postgres://kuberport:kuberport@localhost:5432/kuberport?sslmode=disable)")
	}

	ctx := context.Background()
	verifier, err := auth.NewVerifier(ctx, cfg.OIDCIssuer, cfg.OIDCAudience)
	if err != nil {
		log.Fatalf("OIDC verifier init: %v", err)
	}
	st, err := store.NewStore(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("store init: %v", err)
	}
	defer st.Close()

	r := api.NewRouter(cfg, api.Deps{Verifier: verifier, Store: st, K8sFactory: k8sFactory{}})
	log.Printf("listening on %s", cfg.ListenAddr)
	if err := r.Run(cfg.ListenAddr); err != nil {
		log.Fatal(err)
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
