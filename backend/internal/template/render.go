package template

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"gopkg.in/yaml.v3"
)

type Labels struct {
	ReleaseName     string
	TemplateName    string
	TemplateVersion int
	ReleaseID       string
	AppliedBy       string
}

func Render(resourcesYAML, uiSpecYAML string, values json.RawMessage, l Labels) ([]byte, error) {
	docs, err := parseMultiDoc(resourcesYAML)
	if err != nil {
		return nil, err
	}
	spec, err := parseSpec(uiSpecYAML)
	if err != nil {
		return nil, err
	}

	var input map[string]any
	if err := json.Unmarshal(values, &input); err != nil {
		return nil, fmt.Errorf("values not a JSON object: %w", err)
	}

	for _, f := range spec.Fields {
		raw, present := input[f.Path]
		if !present {
			if f.Required {
				return nil, fmt.Errorf("field %q required", f.Label)
			}
			if f.Default == nil {
				continue
			}
			raw = f.Default
		}
		if err := f.Validate(raw); err != nil {
			return nil, err
		}
		if err := setJSONPath(docs, f.Path, raw); err != nil {
			return nil, err
		}
	}

	for _, d := range docs {
		stampLabels(d, l)
	}

	return marshalMultiDoc(docs)
}

func parseMultiDoc(src string) ([]map[string]any, error) {
	var docs []map[string]any
	dec := yaml.NewDecoder(bytes.NewReader([]byte(src)))
	for {
		m := map[string]any{}
		if err := dec.Decode(&m); err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		if len(m) > 0 {
			docs = append(docs, m)
		}
	}
	return docs, nil
}

func marshalMultiDoc(docs []map[string]any) ([]byte, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	for _, d := range docs {
		if err := enc.Encode(d); err != nil {
			return nil, err
		}
	}
	_ = enc.Close()
	return buf.Bytes(), nil
}

func stampLabels(obj map[string]any, l Labels) {
	meta := ensureMap(obj, "metadata")
	lbls := ensureMap(meta, "labels")
	lbls["kuberport.io/managed"] = "true"
	lbls["kuberport.io/release"] = l.ReleaseName
	lbls["kuberport.io/template"] = l.TemplateName
	lbls["kuberport.io/template-version"] = fmt.Sprintf("%d", l.TemplateVersion)
	anns := ensureMap(meta, "annotations")
	anns["kuberport.io/release-id"] = l.ReleaseID
	anns["kuberport.io/applied-by"] = l.AppliedBy
	anns["kuberport.io/applied-at"] = time.Now().UTC().Format(time.RFC3339)
}
