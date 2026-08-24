import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { exchangeCodeForEncryptedTokens } from "@/lib/gmail/client";

function settingsRedirect(status: string, extra?: string) {
  const url = new URL(`${env.NEXT_PUBLIC_APP_URL}/dashboard/settings`);
  url.searchParams.set("gmail", status);
  if (extra) url.searchParams.set("detail", extra.slice(0, 180));
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    // Browser OAuth callback — send the user to login, not a JSON blob.
    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/login?next=/dashboard/settings`,
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;

  if (oauthError) {
    return settingsRedirect("failed", oauthError);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect("invalid_state");
  }

  cookieStore.delete("gmail_oauth_state");

  try {
    const tokens = await exchangeCodeForEncryptedTokens(code);

    if (!tokens.accessTokenEncrypted) {
      return settingsRedirect("failed", "no_access_token");
    }

    // Prefer a new refresh token; fall back to the existing one on re-consent
    // when Google omits refresh_token.
    const { data: existing } = await auth.supabase
      .from("gmail_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const refreshTokenEncrypted =
      tokens.refreshTokenEncrypted ?? existing?.refresh_token_encrypted ?? null;

    if (!refreshTokenEncrypted) {
      return settingsRedirect("no_refresh_token");
    }

    const { error } = await auth.supabase.from("gmail_connections").upsert(
      {
        user_id: auth.user.id,
        google_email: tokens.googleEmail ?? auth.user.email ?? null,
        access_token_encrypted: tokens.accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        expiry_date: tokens.expiryDate,
        scope: tokens.scope || "https://www.googleapis.com/auth/gmail.compose",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return settingsRedirect("failed", error.message);
    }

    return settingsRedirect("connected");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "token_exchange_failed";
    return settingsRedirect("failed", message);
  }
}
