import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { hasEncryptionEnv, hasGoogleEnv } from "@/lib/env";
import { getGoogleAuthUrl } from "@/lib/gmail/client";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  if (!hasGoogleEnv() || !hasEncryptionEnv()) {
    return NextResponse.json(
      { error: "Google OAuth and ENCRYPTION_KEY environment variables are required." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("gmail_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });

  return NextResponse.redirect(getGoogleAuthUrl(state));
}
