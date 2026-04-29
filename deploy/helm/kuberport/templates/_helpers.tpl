{{/*
Expand the name of the chart.
*/}}
{{- define "kuberport.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
*/}}
{{- define "kuberport.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart name and version as used by the chart label.
*/}}
{{- define "kuberport.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "kuberport.labels" -}}
helm.sh/chart: {{ include "kuberport.chart" . }}
{{ include "kuberport.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels (without version — stable across upgrades).
*/}}
{{- define "kuberport.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kuberport.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Component-scoped names. Used for Deployments / Services / etc.
*/}}
{{- define "kuberport.backend.fullname" -}}
{{- printf "%s-backend" (include "kuberport.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kuberport.frontend.fullname" -}}
{{- printf "%s-frontend" (include "kuberport.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kuberport.postgres.fullname" -}}
{{- printf "%s-postgres" (include "kuberport.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kuberport.migration.fullname" -}}
{{- printf "%s-migrate" (include "kuberport.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Component-scoped selector labels (adds app.kubernetes.io/component).
*/}}
{{- define "kuberport.backend.selectorLabels" -}}
{{ include "kuberport.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end -}}

{{- define "kuberport.frontend.selectorLabels" -}}
{{ include "kuberport.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end -}}

{{- define "kuberport.postgres.selectorLabels" -}}
{{ include "kuberport.selectorLabels" . }}
app.kubernetes.io/component: postgres
{{- end -}}

{{/*
Component-scoped labels (selectorLabels + version + chart).
*/}}
{{- define "kuberport.backend.labels" -}}
{{ include "kuberport.labels" . }}
app.kubernetes.io/component: backend
{{- end -}}

{{- define "kuberport.frontend.labels" -}}
{{ include "kuberport.labels" . }}
app.kubernetes.io/component: frontend
{{- end -}}

{{- define "kuberport.postgres.labels" -}}
{{ include "kuberport.labels" . }}
app.kubernetes.io/component: postgres
{{- end -}}

{{/*
Image reference helpers.
*/}}
{{- define "kuberport.backend.image" -}}
{{- $tag := .Values.images.backend.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.images.backend.repository $tag -}}
{{- end -}}

{{- define "kuberport.frontend.image" -}}
{{- $tag := .Values.images.frontend.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.images.frontend.repository $tag -}}
{{- end -}}

{{/*
Secret name for shared auth + DB env. Either chart-managed or externally provided.
*/}}
{{- define "kuberport.auth.secretName" -}}
{{- if .Values.auth.existingSecret -}}
{{ .Values.auth.existingSecret }}
{{- else -}}
{{ printf "%s-auth" (include "kuberport.fullname" .) }}
{{- end -}}
{{- end -}}

{{/*
DATABASE_URL: in-cluster pg URL when embedded=true, otherwise externalUrl.
Only used at chart-render time to populate the auth Secret. When auth.create=false,
the externally managed Secret must provide DATABASE_URL itself.
*/}}
{{- define "kuberport.databaseUrl" -}}
{{- if .Values.postgres.embedded -}}
{{- $svc := include "kuberport.postgres.fullname" . -}}
{{- printf "postgres://%s:%s@%s:%v/%s?sslmode=disable" .Values.postgres.user .Values.postgres.password $svc .Values.postgres.service.port .Values.postgres.database -}}
{{- else -}}
{{- .Values.postgres.externalUrl -}}
{{- end -}}
{{- end -}}

{{/*
OIDC redirect URI — derived from host if not explicitly set.
*/}}
{{- define "kuberport.oidc.redirectUri" -}}
{{- if .Values.oidc.redirectUri -}}
{{ .Values.oidc.redirectUri }}
{{- else -}}
{{- $scheme := "https" -}}
{{- if not .Values.tls.enabled -}}{{- $scheme = "http" -}}{{- end -}}
{{- printf "%s://%s/api/auth/callback" $scheme .Values.host -}}
{{- end -}}
{{- end -}}
