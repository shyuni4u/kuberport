import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return new NextResponse("cross-origin request rejected", { status: 403 });
  }
  await destroySession();
  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}
