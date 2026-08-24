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

    // A refresh token is required. Never keep a stale one from a previous connect.
    if (!tokens.refreshTokenEncrypted) {
      return NextResponse.redirect(
        `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=no_refresh_token`,
      );
    }

    if (!tokens.accessTokenEncrypted) {
      return NextResponse.redirect(
        `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=failed`,
      );
    }

    // Replace any previous connection entirely so dead tokens cannot linger.
    await auth.supabase.from("gmail_connections").delete().eq("user_id", auth.user.id);

    const { error } = await auth.supabase.from("gmail_connections").insert({
      user_id: auth.user.id,
      google_email: tokens.googleEmail ?? auth.user.email ?? null,
      access_token_encrypted: tokens.accessTokenEncrypted,
      refresh_token_encrypted: tokens.refreshTokenEncrypted,
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
