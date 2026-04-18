import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig, client } from "@/lib/oidc";
import { createSession } from "@/lib/session";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const config = await getConfig();

  const cookieStore = await cookies();
  const raw = cookieStore.get("kbp_oidc_state")?.value;
  if (!raw) return new NextResponse("missing state", { status: 400 });
  const { state, nonce, verifier } = JSON.parse(raw);

  const tokens = await client.authorizationCodeGrant(
    config,
    req.nextUrl,
    {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    },
  );
  const claims = tokens.claims()!;

  const { rows } = await pool.query(
    `INSERT INTO users (oidc_subject, email, display_name)
       VALUES ($1,$2,$3)
     ON CONFLICT (oidc_subject) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, last_seen_at=now()
     RETURNING id`,
    [claims.sub, claims.email ?? null, claims.name ?? null],
  );
  const userId = rows[0].id;

  const expiresAt = tokens.expiresIn()
    ? new Date(Date.now() + tokens.expiresIn()! * 1000)
    : new Date(Date.now() + 3600 * 1000);

  await createSession(
    userId,
    tokens.id_token!,
    tokens.refresh_token,
    expiresAt,
  );
  cookieStore.delete("kbp_oidc_state");
  return NextResponse.redirect(new URL("/catalog", req.nextUrl.origin));
}
