package auth

import (
	"context"

	"github.com/coreos/go-oidc/v3/oidc"
)

type Claims struct {
	Subject string   `json:"sub"`
	Email   string   `json:"email"`
	Name    string   `json:"name"`
	Groups  []string `json:"groups"`
}

type Verifier struct {
	v *oidc.IDTokenVerifier
}

func NewVerifier(ctx context.Context, issuer, clientID string) (*Verifier, error) {
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	return &Verifier{v: provider.Verifier(&oidc.Config{ClientID: clientID})}, nil
}

func (v *Verifier) Verify(ctx context.Context, rawToken string) (Claims, error) {
	tok, err := v.v.Verify(ctx, rawToken)
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := tok.Claims(&c); err != nil {
		return Claims{}, err
	}
	return c, nil
}
