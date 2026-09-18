{{/*
Common labels.
*/}}
{{- define "docurama.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "docurama.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Image reference.
*/}}
{{- define "docurama.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{ .Values.image.repository }}:{{ $tag }}
{{- end }}

{{/*
ROOT_DOMAIN: explicit value wins; otherwise derive from the first ingress
host by dropping its leftmost label (app.docurama.eu → docurama.eu).
*/}}
{{- define "docurama.rootDomain" -}}
{{- if .Values.rootDomain -}}
{{ .Values.rootDomain }}
{{- else if and .Values.ingress.enabled .Values.ingress.hosts -}}
{{- $host := (index .Values.ingress.hosts 0).host -}}
{{- $parts := splitList "." $host -}}
{{- if gt (len $parts) 2 -}}
{{ join "." (rest $parts) }}
{{- else -}}
{{ $host }}
{{- end -}}
{{- else -}}
docurama.eu
{{- end -}}
{{- end }}
