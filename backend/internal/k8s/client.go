package k8s

import (
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

type Client struct {
	dyn dynamic.Interface
}

func NewWithToken(apiURL, caBundle, bearer string) (*Client, error) {
	cfg := &rest.Config{
		Host:        apiURL,
		BearerToken: bearer,
	}
	if caBundle != "" {
		cfg.TLSClientConfig = rest.TLSClientConfig{CAData: []byte(caBundle)}
	} else {
		// Empty CA → dev/kind only. Production callers must supply a CA bundle from the clusters table.
		cfg.TLSClientConfig = rest.TLSClientConfig{Insecure: true}
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return &Client{dyn: dyn}, nil
}
