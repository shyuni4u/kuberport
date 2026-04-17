package template

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

type FieldType string

const (
	TypeString  FieldType = "string"
	TypeInteger FieldType = "integer"
	TypeBoolean FieldType = "boolean"
	TypeEnum    FieldType = "enum"
)

type Field struct {
	Path     string    `yaml:"path"`
	Label    string    `yaml:"label"`
	Help     string    `yaml:"help"`
	Type     FieldType `yaml:"type"`
	Min      *int      `yaml:"min"`
	Max      *int      `yaml:"max"`
	Pattern  string    `yaml:"pattern"`
	Values   []string  `yaml:"values"`
	Default  any       `yaml:"default"`
	Required bool      `yaml:"required"`
}

type UISpec struct {
	Fields []Field `yaml:"fields"`
}

func parseSpec(src string) (UISpec, error) {
	var s UISpec
	if err := yaml.Unmarshal([]byte(src), &s); err != nil {
		return UISpec{}, fmt.Errorf("ui-spec unmarshal: %w", err)
	}
	return s, nil
}

func (f Field) Validate(v any) error {
	switch f.Type {
	case TypeInteger:
		n, ok := toInt(v)
		if !ok {
			return fmt.Errorf("%s: not an integer", f.Label)
		}
		if f.Min != nil && n < *f.Min {
			return fmt.Errorf("%s: below min %d", f.Label, *f.Min)
		}
		if f.Max != nil && n > *f.Max {
			return fmt.Errorf("%s: above max %d", f.Label, *f.Max)
		}
	case TypeEnum:
		s := fmt.Sprint(v)
		for _, vv := range f.Values {
			if s == vv {
				return nil
			}
		}
		return fmt.Errorf("%s: not in %v", f.Label, f.Values)
	}
	return nil
}

func toInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	}
	return 0, false
}
