import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Routes publiques : login + webhooks (protégés par leurs propres secrets)
  if (
    pathname === "/login" ||
    pathname === "/api/uploadtest" || // TEMP
    pathname.startsWith("/api/telegram") ||
    pathname.startsWith("/api/hooks")
  ) {
    return NextResponse.next();
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // api/studio/upload est HORS middleware : le middleware Next plafonne le body
  // à 10 Mo (uploads vidéo impossibles). La route fait sa propre auth (session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|api/studio/upload).*)"],
};
