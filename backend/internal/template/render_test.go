package template_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"

	"kuberport/internal/template"
)

const resourcesYAML = `
apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: placeholder
---
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  ports: [{ port: 80 }]
`

const uiSpecYAML = `
fields:
  - path: Deployment[web].spec.replicas
    label: "인스턴스 개수"
    type: integer
    min: 1
    max: 20
    default: 3
  - path: Deployment[web].spec.template.spec.containers[0].image
    label: "Image"
    type: string
`

func TestRender_AppliesValuesAndStampsLabels(t *testing.T) {
	values, _ := json.Marshal(map[string]any{
		"Deployment[web].spec.replicas":                          5,
		"Deployment[web].spec.template.spec.containers[0].image": "nginx:1.25",
	})

	out, err := template.Render(resourcesYAML, uiSpecYAML, values, template.Labels{
		ReleaseName: "my-api", TemplateName: "web-service",
		TemplateVersion: 2, ReleaseID: "rel_abc", AppliedBy: "alice@example.com",
	})
	require.NoError(t, err)

	var docs []map[string]any
	dec := yaml.NewDecoder(bytes.NewReader(out))
	for {
		m := map[string]any{}
		if err := dec.Decode(&m); err != nil {
			break
		}
		docs = append(docs, m)
	}
	require.Len(t, docs, 2)

	dep := docs[0]
	spec := dep["spec"].(map[string]any)
	require.Equal(t, 5, spec["replicas"])

	ctrs := spec["template"].(map[string]any)["spec"].(map[string]any)["containers"].([]any)
	require.Equal(t, "nginx:1.25", ctrs[0].(map[string]any)["image"])

	meta := dep["metadata"].(map[string]any)
	lbls := meta["labels"].(map[string]any)
	require.Equal(t, "my-api", lbls["kuberport.io/release"])
	require.Equal(t, "2", lbls["kuberport.io/template-version"])
}

func TestRender_ValidatesMin(t *testing.T) {
	values, _ := json.Marshal(map[string]any{
		"Deployment[web].spec.replicas": 0,
	})
	_, err := template.Render(resourcesYAML, uiSpecYAML, values, template.Labels{})
	require.ErrorContains(t, err, "min")
}

func TestRender_IndexOutOfRangeReturnsError(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].spec.template.spec.containers[99].image
    label: "Container Image"
    type: string
`
	values, _ := json.Marshal(map[string]any{
		"Deployment[web].spec.template.spec.containers[99].image": "x",
	})
	_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
	require.ErrorContains(t, err, "out of range")
}

func TestValidateSpec_AcceptsRequiredFieldsWithoutValues(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].spec.replicas
    label: "Replicas"
    type: integer
    required: true
`
	require.NoError(t, template.ValidateSpec(resourcesYAML, uiSpec))
}

func TestValidateSpec_RejectsMalformedUISpec(t *testing.T) {
	require.Error(t, template.ValidateSpec(resourcesYAML, "fields: [invalid"))
}

func TestRender_MissingIntermediateArrayFails(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].spec.annotations[0]
    label: "Annotation"
    type: string
`
	values, _ := json.Marshal(map[string]any{
		"Deployment[web].spec.annotations[0]": "x",
	})
	_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
	require.ErrorContains(t, err, "cannot auto-create array")
}

func TestRender_BooleanType(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].spec.paused
    label: "Paused"
    type: boolean
`
	t.Run("bool ok", func(t *testing.T) {
		values, _ := json.Marshal(map[string]any{
			"Deployment[web].spec.paused": true,
		})
		_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
		require.NoError(t, err)
	})
	t.Run("string rejected", func(t *testing.T) {
		values, _ := json.Marshal(map[string]any{
			"Deployment[web].spec.paused": "yes",
		})
		_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
		require.ErrorContains(t, err, "not a boolean")
	})
}

func TestParseSpec_RejectsInvalidPatternEagerly(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].metadata.name
    label: "Name"
    type: string
    pattern: "["
`
	require.Error(t, template.ValidateSpec(resourcesYAML, uiSpec))
}

func TestRender_PatternValidation(t *testing.T) {
	uiSpec := `fields:
  - path: Deployment[web].metadata.name
    label: "Name"
    type: string
    pattern: "^[a-z][a-z0-9-]*$"
`
	t.Run("matching", func(t *testing.T) {
		values, _ := json.Marshal(map[string]any{
			"Deployment[web].metadata.name": "valid-name",
		})
		_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
		require.NoError(t, err)
	})
	t.Run("non-matching", func(t *testing.T) {
		values, _ := json.Marshal(map[string]any{
			"Deployment[web].metadata.name": "Invalid Name 123",
		})
		_, err := template.Render(resourcesYAML, uiSpec, values, template.Labels{})
		require.ErrorContains(t, err, "pattern")
	})
}
