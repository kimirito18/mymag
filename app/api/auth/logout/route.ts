import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/app/lib/server-current-user";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  });
  return response;
}
