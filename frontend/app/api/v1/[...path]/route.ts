import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSessionTokens } from "@/lib/session";
import { getConfig, client } from "@/lib/oidc";

import type { Session } from "@/lib/session";

async function getValidToken(session: Session): Promise<string | null> {
  if (session.idTokenExp.getTime() > Date.now() + 60_000) return session.idToken;
  if (!session.refreshToken) return null;

  const config = await getConfig();
  const tokens = await client.refreshTokenGrant(config, session.refreshToken);

  const exp = tokens.expiresIn()
    ? new Date(Date.now() + tokens.expiresIn()! * 1000)
    : new Date(Date.now() + 3600 * 1000);

  await updateSessionTokens(
    session.id,
    tokens.id_token!,
    tokens.refresh_token ?? session.refreshToken,
    exp,
  );
  return tokens.id_token!;
}

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  const token = session ? await getValidToken(session) : null;
  if (!token) {
    return NextResponse.json(
      { type: "unauthenticated", status: 401 },
      { status: 401 },
    );
  }

  const { path } = await params;
  const url = `${process.env.GO_API_BASE_URL}/v1/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
