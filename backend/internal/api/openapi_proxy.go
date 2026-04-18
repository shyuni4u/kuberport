package api

import (
	"crypto/tls"
	"crypto/x509"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	lru "github.com/hashicorp/golang-lru/v2"

	"kuberport/internal/auth"
)

type openapiCacheKey struct {
	cluster string
	user    string // oidc subject
	gv      string // "" for the index, "apps/v1" etc. otherwise
}

type openapiCacheEntry struct {
	body      []byte
	storedAt  time.Time
	contentTy string
}

type openapiProxy struct {
	cache *lru.Cache[openapiCacheKey, openapiCacheEntry]
	mu    sync.Mutex
}

const openapiTTL = 60 * time.Minute

func newOpenAPIProxy(size int) *openapiProxy {
	if size <= 0 {
		size = 64
	}
	c, _ := lru.New[openapiCacheKey, openapiCacheEntry](size)
	return &openapiProxy{cache: c}
}

func (h *Handlers) GetOpenAPIIndex(c *gin.Context) {
	h.proxyOpenAPI(c, "")
}

func (h *Handlers) GetOpenAPIGroupVersion(c *gin.Context) {
	gv := strings.TrimPrefix(c.Param("gv"), "/")
	if gv == "" {
		writeError(c, http.StatusBadRequest, "validation-error", "gv required")
		return
	}
	h.proxyOpenAPI(c, gv)
}

func (h *Handlers) RefreshOpenAPI(c *gin.Context) {
	cluster := c.Param("name")
	u, _ := auth.UserFrom(c.Request.Context())
	h.openapi.mu.Lock()
	defer h.openapi.mu.Unlock()
	for _, k := range h.openapi.cache.Keys() {
		if k.cluster == cluster && k.user == u.Subject {
			h.openapi.cache.Remove(k)
		}
	}
	c.Status(http.StatusNoContent)
}

func (h *Handlers) proxyOpenAPI(c *gin.Context, gv string) {
	name := c.Param("name")
	cluster, err := h.deps.Store.GetClusterByName(c, name)
	if err != nil {
		writeError(c, http.StatusNotFound, "not-found", "cluster "+name)
		return
	}
	u, _ := auth.UserFrom(c.Request.Context())

	key := openapiCacheKey{cluster: name, user: u.Subject, gv: gv}
	if e, ok := h.openapi.cache.Get(key); ok && time.Since(e.storedAt) < openapiTTL {
		c.Data(http.StatusOK, e.contentTy, e.body)
		return
	}

	upstreamPath := "/openapi/v3"
	if gv != "" {
		upstreamPath = "/openapi/v3/apis/" + gv
	}
	up, err := url.Parse(cluster.ApiUrl)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	up.Path = upstreamPath
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, up.String(), nil)
	req.Header.Set("Authorization", "Bearer "+u.IDToken)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Transport: buildTransport(cluster.CaBundle.String)}
	resp, err := client.Do(req)
	if err != nil {
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(c, http.StatusBadGateway, "k8s-error", err.Error())
		return
	}
	if resp.StatusCode >= 400 {
		writeError(c, resp.StatusCode, "k8s-error", string(body))
		return
	}

	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/json"
	}
	h.openapi.cache.Add(key, openapiCacheEntry{body: body, storedAt: time.Now(), contentTy: ct})
	c.Data(http.StatusOK, ct, body)
}

func buildTransport(caBundle string) http.RoundTripper {
	t := http.DefaultTransport.(*http.Transport).Clone()
	if strings.TrimSpace(caBundle) == "" {
		t.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		return t
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if ok := pool.AppendCertsFromPEM([]byte(caBundle)); !ok {
		t.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		return t
	}
	t.TLSClientConfig = &tls.Config{RootCAs: pool}
	return t
}
