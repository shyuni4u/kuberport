# Local end-to-end setup

Run the full browser → deploy-to-kind flow on one machine. Use this when you
need to test a change that crosses the dex / Go / Next.js / k8s boundaries —
unit and integration tests won't catch OIDC trust, BFF proxying, or actual pod
scheduling.

For run-of-the-mill coding, `make test` against docker compose is enough. This
doc is the ladder for when you actually need to click around as alice and watch
a pod come up.

## Prereqs (install once per machine)

- Docker Desktop (WSL2 integration on for Windows)
- Go 1.22+, Node 20+, pnpm 9+
- `atlas`, `kind` (`v0.23+`), `kubectl`
- `openssl`

See [dev-setup.md](dev-setup.md) for Docker Desktop / WSL2 gotchas. Everything
below assumes your repo lives under `~/dev/kuberport` (WSL2 home), not on
`/mnt/c/`.

## One-time setup

### 1. Fix Windows `hosts` for `host.docker.internal`

Docker Desktop sometimes writes a bad IP into Windows's hosts file (e.g. the
machine's public IP from ISP DNS leak). Open PowerShell as Administrator:

```powershell
notepad C:\Windows\System32\drivers\etc\hosts
```

Find the lines:

```
### # Added by Docker Desktop
<some-wrong-ip> host.docker.internal
<some-wrong-ip> gateway.docker.internal
```

Replace the IPs with `127.0.0.1`. Save. No reboot needed — WSL2's
`host.docker.internal` resolution will then return `127.0.0.1` automatically.

Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://host.docker.internal:5556/   # should be 000 (nothing listening yet), NOT timeout
```

### 2. Self-signed dex cert

`k8s 1.30+` rejects `http://` OIDC issuer URLs with "URL scheme must be
https", so dex runs over TLS even locally.

```bash
cd deploy/docker/certs
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout dex.key -out dex.crt \
  -subj "/CN=host.docker.internal" \
  -addext "subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1"
chmod 644 dex.key        # dex container needs read access
```

Files are gitignored.

### 3. DB schema

```bash
cd backend/migrations
atlas schema apply --env local --auto-approve
```

Only re-run when `schema.hcl` changes.

## Every-session setup

### 4. Start dex + Postgres

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
curl -ks https://host.docker.internal:5556/.well-known/openid-configuration | jq .issuer
# → "https://host.docker.internal:5556"
```

### 5. Create kind cluster with OIDC trust for dex

Save as `/tmp/kind-cluster.yaml` (adjust the `hostPath` to your repo):

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: kuberport
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /home/<you>/kuberport/deploy/docker/certs/dex.crt
        containerPath: /etc/kubernetes/pki/dex-ca.crt
        readOnly: true
    kubeadmConfigPatches:
      - |
        kind: ClusterConfiguration
        apiServer:
          extraArgs:
            oidc-issuer-url: https://host.docker.internal:5556
            oidc-client-id: kuberport
            oidc-username-claim: email
            oidc-groups-claim: groups
            oidc-ca-file: /etc/kubernetes/pki/dex-ca.crt
    extraPortMappings:
      - containerPort: 6443
        hostPort: 6443
        listenAddress: "127.0.0.1"
```

```bash
kind create cluster --config /tmp/kind-cluster.yaml --wait 2m
```

### 6. RBAC so dex users can do things

```bash
cat <<'YAML' | kubectl --context kind-kuberport apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: kuberport-admin }
subjects:
  - kind: Group
    name: kuberport-admin
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: kuberport-users, namespace: default }
subjects:
  - kind: Group
    name: system:authenticated
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: edit
  apiGroup: rbac.authorization.k8s.io
YAML
```

`kuberport-admin` is aspirational — dex staticPasswords can't emit `groups`
claims (see **Known limits**). The `system:authenticated` binding is what
actually lets alice deploy.

### 7. Backend

```bash
cd backend
LISTEN_ADDR=:8080 \
  DATABASE_URL='postgres://kuberport:kuberport@localhost:5432/kuberport?sslmode=disable' \
  OIDC_ISSUER=https://host.docker.internal:5556 \
  OIDC_AUDIENCE=kuberport \
  OIDC_CA_FILE="$(pwd)/../deploy/docker/certs/dex.crt" \
  APP_ENCRYPTION_KEY_B64="$(openssl rand -base64 32)" \
  KBP_DEV_ADMIN_EMAILS=admin@example.com \
  go run ./cmd/server
```

`KBP_DEV_ADMIN_EMAILS` is how we fake the `kuberport-admin` group locally —
see **Known limits**. Never set in prod.

### 8. Frontend

Create `frontend/.env.local`:

```env
DATABASE_URL=postgres://kuberport:kuberport@localhost:5432/kuberport
APP_ENCRYPTION_KEY_B64=<same value as backend>
GO_API_BASE_URL=http://localhost:8080

OIDC_ISSUER=https://host.docker.internal:5556
OIDC_CLIENT_ID=kuberport
OIDC_CLIENT_SECRET=local-dev-secret
OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

Start with the CA path exported (Next.js openid-client must trust the self-
signed dex cert):

```bash
cd frontend
NODE_EXTRA_CA_CERTS="$(pwd)/../deploy/docker/certs/dex.crt" pnpm dev
```

### 9. Register the cluster + seed a template

```bash
ADM=$(curl -ks -X POST https://host.docker.internal:5556/token \
  -d grant_type=password -d client_id=kuberport -d client_secret=local-dev-secret \
  -d username=admin@example.com -d password=admin \
  -d 'scope=openid email profile groups' | jq -r .id_token)

# Cluster — register with kind's own CA (not dex's; the CA here validates
# the apiserver cert, and kind signs that with its internal cluster CA).
KIND_CA=$(kubectl --context kind-kuberport config view --raw --minify --flatten -o json \
  | jq -r '.clusters[0].cluster."certificate-authority-data"' | base64 -d)

jq -n --arg ca "$KIND_CA" '{
  name:"kind",
  api_url:"https://127.0.0.1:6443",
  ca_bundle:$ca,
  oidc_issuer_url:"https://host.docker.internal:5556"
}' | curl -s -H "Authorization: Bearer $ADM" -H 'content-type: application/json' \
  -X POST http://localhost:8080/v1/clusters -d @-

# Sample template + publish
curl -s -H "Authorization: Bearer $ADM" -H 'content-type: application/json' \
  -X POST http://localhost:8080/v1/templates -d @- <<'JSON'
{
  "name":"web",
  "display_name":"Web Service",
  "resources_yaml":"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: app\n          image: nginx:1.25\n          ports:\n            - containerPort: 80\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector: {app: web}\n  ports: [{port: 80, targetPort: 80}]\n",
  "ui_spec_yaml":"fields:\n  - path: Deployment[web].spec.replicas\n    label: 인스턴스 개수\n    type: integer\n    min: 1\n    max: 5\n    default: 2\n    required: true\n  - path: Deployment[web].spec.template.spec.containers[0].image\n    label: 컨테이너 이미지\n    type: string\n    default: nginx:1.25\n    required: true\n"
}
JSON

curl -s -H "Authorization: Bearer $ADM" -X POST \
  http://localhost:8080/v1/templates/web/versions/1/publish
```

### 10. Browser

1. Visit `https://host.docker.internal:5556/.well-known/openid-configuration`
   once, click **Advanced → Proceed** to cache the self-signed cert exception.
2. `http://localhost:3000` → login as `alice@example.com` / `alice`
3. Catalog → Web Service → 배포 → fill form → submit
4. Release detail page should show `healthy` with 1 instance

## Troubleshooting

- **`cluster has no ca_bundle` on OpenAPI fetch.** As of the third-round
  hardening pass, empty `ca_bundle` cluster registrations are rejected at
  openapi proxy time to avoid silently trusting any cert. Either (a) register
  the cluster WITH its CA (step 9 above already does — `KIND_CA`), or (b) for
  bare-bones manual tests, export `KBP_DEV_ALLOW_INSECURE_CLUSTERS=true` on the
  backend process. Never set this env in prod.

## Known limits

- **dex staticPasswords ignores the `groups` field.** Even with `groups: [kuberport-admin]` in `dex.yaml`, the issued id_token has no `groups` claim. We work around this two ways:
  - App-level: `KBP_DEV_ADMIN_EMAILS` env var on the backend elevates specific emails. Dev-only.
  - Cluster-level: the `system:authenticated` RoleBinding in `default` namespace is what lets alice deploy. `kuberport-admin` → cluster-admin exists but is never actually matched locally.

  With a real IdP (Okta / Keycloak / etc.) groups come through the id_token normally and `KBP_DEV_ADMIN_EMAILS` stays unset.

- **Self-signed cert.** Browsers need the one-time exception. `NODE_EXTRA_CA_CERTS` (Next.js) and `OIDC_CA_FILE` (Go) handle the server-side trust.

- **kindest/node image.** Default pulled by kind v0.23 is k8s 1.30. That's the one that requires https OIDC. On older kind versions pinned to 1.29, plain http works but you then diverge from the current kind defaults.

## Tear down

```bash
kind delete cluster --name kuberport
docker compose -f deploy/docker/docker-compose.yml down   # keeps pgdata volume
```

Wipe everything including DB: append `-v` to the compose command.
