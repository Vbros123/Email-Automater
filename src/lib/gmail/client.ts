import "server-only";

import { google, type gmail_v1 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Use the OAuth2 type from googleapis itself to avoid duplicate google-auth-library type conflicts. */
type GoogleOAuthClient = ReturnType<typeof createOAuthClient>;

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
  auth: GoogleOAuthClient;
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
  supabase: SupabaseClient,
  userId: string,
  auth: GoogleOAuthClient,
) {
  const credentials = auth.credentials;

  if (!credentials.access_token && !credentials.refresh_token) {
    return;
  }

  const payload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (credentials.access_token) {
    payload.access_token_encrypted = encryptSecret(credentials.access_token);
  }

  if (credentials.refresh_token) {
    payload.refresh_token_encrypted = encryptSecret(credentials.refresh_token);
  }

  if (credentials.expiry_date) {
    payload.expiry_date = new Date(credentials.expiry_date).toISOString();
  }

  await supabase.from("gmail_connections").update(payload).eq("user_id", userId);
}

export async function assertGmailAccess(gmail: gmail_v1.Gmail) {
  await gmail.users.drafts.list({ userId: "me", maxResults: 1 });
}

/**
 * RFC 2822 message → base64url, matching Google's Node samples.
 * No From header (Gmail sets the connected account).
 * No 7bit CTE (breaks on non-ASCII body text).
 */
export function createRawEmail(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const to = sanitizeHeader(input.to);
  if (!to || !to.includes("@")) {
    throw new Error(`Invalid recipient address: ${input.to || "(empty)"}`);
  }

  const subject = encodeSubject(input.subject || "(no subject)");
  const body = (input.body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Official samples use \n separators and minimal headers.
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    body,
  ].join("\n");

  return Buffer.from(message, "utf8")
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
    errors?: Array<{ message?: string; reason?: string }>;
    response?: {
      status?: number;
      statusText?: string;
      data?: unknown;
    };
  };

  const data = err.response?.data as
    | {
        error?: {
          message?: string;
          status?: string;
          code?: number;
          errors?: Array<{ message?: string; reason?: string }>;
        };
        error_description?: string;
      }
    | string
    | undefined;

  let apiMessage = "";

  if (typeof data === "string" && data.trim()) {
    apiMessage = data.trim();
  } else if (data && typeof data === "object") {
    apiMessage =
      data.error?.errors?.[0]?.message ||
      data.error?.errors?.[0]?.reason ||
      data.error?.message ||
      data.error_description ||
      "";
  }

  if (!apiMessage) {
    apiMessage =
      err.errors?.[0]?.message ||
      err.message ||
      err.response?.statusText ||
      "Gmail draft creation failed.";
  }

  // Strip duplicate "Bad Request" noise from googleapis wrapper messages.
  apiMessage = apiMessage
    .replace(/^Request failed with status code 400\s*/i, "")
    .replace(/^Bad Request:?\s*/i, "")
    .trim();

  if (!apiMessage) {
    apiMessage = "Invalid email payload (check recipient addresses and template content).";
  }

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
  if (/^[\x20-\x7E]*$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
