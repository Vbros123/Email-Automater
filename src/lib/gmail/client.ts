import "server-only";

import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { env, hasGoogleEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

export function createOAuthClient() {
  if (!hasGoogleEnv()) {
    throw new Error("Google OAuth environment variables are not configured.");
  }

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function getGoogleAuthUrl(state: string) {
  const client = createOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function exchangeCodeForEncryptedTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google did not return usable Gmail tokens.");
  }

  return {
    accessTokenEncrypted: tokens.access_token
      ? encryptSecret(tokens.access_token)
      : null,
    refreshTokenEncrypted: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? GMAIL_SCOPES.join(" "),
  };
}

export type GmailConnection = {
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expiry_date: string | null;
  google_email?: string | null;
};

export function createGmailAuth(connection: GmailConnection): {
  auth: OAuth2Client;
  gmail: gmail_v1.Gmail;
} {
  const auth = createOAuthClient();

  auth.setCredentials({
    access_token: connection.access_token_encrypted
      ? decryptSecret(connection.access_token_encrypted)
      : undefined,
    refresh_token: connection.refresh_token_encrypted
      ? decryptSecret(connection.refresh_token_encrypted)
      : undefined,
    expiry_date: connection.expiry_date
      ? new Date(connection.expiry_date).getTime()
      : undefined,
  });

  return {
    auth,
    gmail: google.gmail({ version: "v1", auth }),
  };
}

/** @deprecated use createGmailAuth */
export function createGmailClient(connection: GmailConnection) {
  return createGmailAuth(connection).gmail;
}

export async function persistGmailTokens(
  supabase: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<unknown>;
      };
    };
  },
  userId: string,
  auth: OAuth2Client,
) {
  const credentials = auth.credentials;

  if (!credentials.access_token && !credentials.refresh_token) {
    return;
  }

  await supabase
    .from("gmail_connections")
    .update({
      access_token_encrypted: credentials.access_token
        ? encryptSecret(credentials.access_token)
        : undefined,
      refresh_token_encrypted: credentials.refresh_token
        ? encryptSecret(credentials.refresh_token)
        : undefined,
      expiry_date: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function assertGmailAccess(gmail: gmail_v1.Gmail) {
  // Lightweight probe so we fail fast on bad tokens instead of 50 times.
  await gmail.users.getProfile({ userId: "me" });
}

export function createRawEmail(input: {
  to: string;
  from?: string;
  subject: string;
  body: string;
}) {
  // Gmail expects a full RFC 2822 message, then base64url-encoded.
  // Keep the body as UTF-8 text; Gmail accepts this for drafts.create.
  const lines = [
    `To: ${sanitizeHeader(input.to)}`,
    input.from ? `From: ${sanitizeHeader(input.from)}` : null,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
  ].filter((line) => line !== null);

  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getGmailErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Gmail draft creation failed.";
  }

  const err = error as {
    message?: string;
    code?: number | string;
    response?: {
      status?: number;
      data?: {
        error?: { message?: string; status?: string; code?: number };
        error_description?: string;
      };
    };
  };

  const apiMessage =
    err.response?.data?.error?.message ||
    err.response?.data?.error_description ||
    err.message ||
    "Gmail draft creation failed.";

  const status = err.response?.status ?? err.code;
  if (status === 401 || status === 403) {
    return `${apiMessage} Reconnect Gmail in Settings.`;
  }

  return apiMessage;
}

export function isGmailAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: number | string;
    response?: { status?: number };
    message?: string;
  };
  const status = err.response?.status ?? err.code;
  if (status === 401 || status === 403) return true;
  const message = (err.message ?? "").toLowerCase();
  return (
    message.includes("invalid_grant") ||
    message.includes("invalid credentials") ||
    message.includes("unauthorized") ||
    message.includes("insufficient permission")
  );
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string) {
  const clean = sanitizeHeader(value);
  // Encode non-ASCII subjects per RFC 2047.
  if (/^[\x20-\x7E]*$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
