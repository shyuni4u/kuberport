import { describe, it, expect } from "vitest";

import { yamlToUIState } from "./yaml-to-ui-state";

const sampleResources = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: app
          image: nginx:1.25
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`;

const sampleUISpec = `
fields:
  - path: Deployment[web].spec.replicas
    label: 인스턴스 개수
    type: integer
    min: 1
    max: 5
    default: 2
    required: true
  - path: Deployment[web].spec.template.spec.containers[0].image
    label: 컨테이너 이미지
    type: string
    default: nginx:1.25
    required: true
`;

describe("yamlToUIState", () => {
  it("builds one UIResource per document", () => {
    const { uiState } = yamlToUIState(sampleResources, sampleUISpec);
    expect(uiState.resources).toHaveLength(2);
    const [dep, svc] = uiState.resources;
    expect(dep.kind).toBe("Deployment");
    expect(dep.name).toBe("web");
    expect(dep.apiVersion).toBe("apps/v1");
    expect(svc.kind).toBe("Service");
    expect(svc.name).toBe("web");
  });

  it("captures scalar leaves as `fixed` fields with the raw value", () => {
    const { uiState } = yamlToUIState(sampleResources, sampleUISpec);
    const dep = uiState.resources[0];
    // selector.matchLabels.app is a scalar leaf that isn't in ui-spec → fixed.
    expect(dep.fields["spec.selector.matchLabels.app"]).toEqual({
      mode: "fixed",
      fixedValue: "web",
    });
    // Array element scalar.
    expect(dep.fields["spec.template.spec.containers[0].name"]).toEqual({
      mode: "fixed",
      fixedValue: "app",
    });
  });

  it("promotes ui-spec paths to `exposed` with the full UISpecEntry", () => {
    const { uiState } = yamlToUIState(sampleResources, sampleUISpec);
    const dep = uiState.resources[0];
    const replicas = dep.fields["spec.replicas"];
    expect(replicas.mode).toBe("exposed");
    expect(replicas.uiSpec?.label).toBe("인스턴스 개수");
    expect(replicas.uiSpec?.min).toBe(1);
    expect(replicas.uiSpec?.max).toBe(5);
  });

  it("warns when ui-spec references an unknown resource", () => {
    const { warnings } = yamlToUIState(sampleResources, `
fields:
  - path: Deployment[ghost].spec.replicas
    label: X
    type: integer
`);
    expect(warnings.some((w) => w.includes("ghost"))).toBe(true);
  });

  it("skips resources missing apiVersion/kind/metadata.name with a warning", () => {
    const { uiState, warnings } = yamlToUIState(`
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
`, "fields: []");
    expect(uiState.resources).toHaveLength(0);
    expect(warnings.some((w) => w.includes("missing apiVersion"))).toBe(true);
  });
});
