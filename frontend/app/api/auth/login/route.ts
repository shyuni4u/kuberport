import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig, client } from "@/lib/oidc";

export async function GET() {
  const config = await getConfig();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);

  const cookieStore = await cookies();
  cookieStore.set(
    "kbp_oidc_state",
    JSON.stringify({ state, nonce, verifier }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 },
  );

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: process.env.OIDC_REDIRECT_URI!,
    scope: "openid email profile groups",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(url.href);
}
