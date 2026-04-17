package main

import (
	"context"
	"log"
	"os"

	"kuberport/internal/api"
	"kuberport/internal/auth"
	"kuberport/internal/config"
)

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
	verifier, err := auth.NewVerifier(context.Background(), cfg.OIDCIssuer, cfg.OIDCAudience)
	if err != nil {
		log.Fatalf("OIDC verifier init: %v", err)
	}

	r := api.NewRouter(cfg, api.Deps{Verifier: verifier})
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
