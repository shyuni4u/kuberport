.PHONY: compose-up compose-down test e2e e2e-ui

compose-up:
	docker compose -f deploy/docker/docker-compose.yml up -d

compose-down:
	docker compose -f deploy/docker/docker-compose.yml down

test:
	cd backend && go test ./...

# Full end-to-end happy-path smoke covering the Plan 1 vertical slice.
# Requires: docker compose up, a kind cluster with its API URL in KBP_KIND_API,
# kubectl configured for the same cluster.
e2e: compose-up
	cd backend/migrations && atlas schema apply --env local --auto-approve
	cd backend && go test -tags=e2e ./e2e/... -v

# Browser-level Plan 2 regression suite. Requires the full local-e2e.md
# stack (compose + kind + backend + frontend dev) to be running first.
e2e-ui:
	cd frontend && pnpm test:e2e
