package main

import (
	"log"
	"os"

	"kuberport/internal/api"
	"kuberport/internal/config"
)

func main() {
	cfg := config.Config{
		ListenAddr:  getenv("LISTEN_ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		OIDCIssuer:  os.Getenv("OIDC_ISSUER"),
	}
	r := api.NewRouter(cfg)
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
