package k8s

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	utilyaml "k8s.io/apimachinery/pkg/util/yaml"
	"sigs.k8s.io/yaml"
)

// ApplyAll server-side applies every doc in a multi-document YAML stream.
// Objects without metadata.namespace inherit the namespace argument.
// All documents are attempted even if some fail; errors are aggregated.
func (c *Client) ApplyAll(ctx context.Context, namespace string, multiDoc []byte) error {
	objs, err := splitYAML(multiDoc)
	if err != nil {
		return fmt.Errorf("split yaml: %w", err)
	}
	var errs []error
	for _, o := range objs {
		gvk := o.GroupVersionKind()
		plural := pluralize(gvk.Kind)
		if plural == "" {
			errs = append(errs, fmt.Errorf("unsupported kind %q (MVP supports §12.1 only)", gvk.Kind))
			continue
		}
		gvr := schema.GroupVersionResource{
			Group:    gvk.Group,
			Version:  gvk.Version,
			Resource: plural,
		}
		if o.GetNamespace() == "" {
			o.SetNamespace(namespace)
		}
		buf, err := yaml.Marshal(o.Object)
		if err != nil {
			errs = append(errs, fmt.Errorf("marshal %s/%s/%s: %w", gvk.Kind, o.GetNamespace(), o.GetName(), err))
			continue
		}
		_, err = c.dyn.Resource(gvr).Namespace(o.GetNamespace()).Patch(
			ctx, o.GetName(), types.ApplyPatchType, buf,
			metav1.PatchOptions{FieldManager: "kuberport", Force: boolPtr(true)},
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("apply %s/%s/%s: %w", gvk.Kind, o.GetNamespace(), o.GetName(), err))
			continue
		}
	}
	return errors.Join(errs...)
}

func boolPtr(b bool) *bool { return &b }

func splitYAML(src []byte) ([]*unstructured.Unstructured, error) {
	var out []*unstructured.Unstructured
	dec := utilyaml.NewYAMLToJSONDecoder(bytes.NewReader(src))
	for {
		u := &unstructured.Unstructured{}
		if err := dec.Decode(&u.Object); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}
		if u.Object == nil {
			continue
		}
		out = append(out, u)
	}
	return out, nil
}

// kindToPlural covers only the §12.1 MVP kinds. Unknown kinds map to ""
// so the caller can surface a clear error.
var kindToPlural = map[string]string{
	"Deployment":            "deployments",
	"StatefulSet":           "statefulsets",
	"DaemonSet":             "daemonsets",
	"Job":                   "jobs",
	"CronJob":               "cronjobs",
	"Service":               "services",
	"Ingress":               "ingresses",
	"ConfigMap":             "configmaps",
	"Secret":                "secrets",
	"PersistentVolumeClaim": "persistentvolumeclaims",
}

func pluralize(kind string) string {
	return kindToPlural[kind]
}
