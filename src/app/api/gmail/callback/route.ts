import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { exchangeCodeForEncryptedTokens } from "@/lib/gmail/client";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=invalid_state`,
    );
  }

  cookieStore.delete("gmail_oauth_state");

  try {
    const tokens = await exchangeCodeForEncryptedTokens(code);

    const { data: existing } = await auth.supabase
      .from("gmail_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const { error } = await auth.supabase.from("gmail_connections").upsert({
      user_id: auth.user.id,
      // Prefer the real Google account email from userinfo.
      google_email: tokens.googleEmail ?? auth.user.email ?? null,
      access_token_encrypted: tokens.accessTokenEncrypted,
      refresh_token_encrypted:
        tokens.refreshTokenEncrypted ?? existing?.refresh_token_encrypted ?? null,
      expiry_date: tokens.expiryDate,
      scope: tokens.scope,
      connected_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=connected`,
    );
  } catch {
    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=failed`,
    );
  }
}
