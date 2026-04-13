import { NextResponse } from "next/server";
import { getProviderTokenCookieName } from "@/lib/integrations";

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  for (const provider of ["google", "github"] as const) {
    response.cookies.set(getProviderTokenCookieName(provider), "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}