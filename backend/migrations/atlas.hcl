env "local" {
  src = "file://schema.hcl"
  url = "postgres://kuberport:kuberport@localhost:5432/kuberport?sslmode=disable"
  dev = "docker://postgres/16/dev"
}
