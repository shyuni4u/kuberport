import { Pool } from "pg";

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://kuberport:kuberport@localhost:5432/kuberport",
});
