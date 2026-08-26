import "server-only";

import { google, type gmail_v1 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, hasGoogleEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

type GoogleOAuthClient = ReturnType<typeof createOAuthClient>;

export function getGoogleAuthUrl(state: string) {
  const client = createOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function exchangeCodeForEncryptedTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token.");
  }

  client.setCredentials(tokens);

  let googleEmail: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get();
    googleEmail = profile.data.email ?? null;
  } catch {
    googleEmail = null;
  }

  return {
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? GMAIL_SCOPES.join(" "),
    googleEmail,
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

  let accessToken: string | undefined;
  let refreshToken: string | undefined;

  try {
    accessToken = connection.access_token_encrypted
      ? decryptSecret(connection.access_token_encrypted)
      : undefined;
    refreshToken = connection.refresh_token_encrypted
      ? decryptSecret(connection.refresh_token_encrypted)
      : undefined;
  } catch {
    throw new Error(
      "Could not decrypt Gmail tokens. Check ENCRYPTION_KEY is unchanged, then reconnect Gmail.",
    );
  }

  if (!refreshToken && !accessToken) {
    throw new Error("Gmail connection has no tokens. Reconnect Gmail in Settings.");
  }

  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: connection.expiry_date
      ? new Date(connection.expiry_date).getTime()
      : undefined,
  });

  return {
    auth,
    gmail: google.gmail({ version: "v1", auth }),
  };
}

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

export async function clearGmailConnection(
  supabase: SupabaseClient,
  userId: string,
) {
  await supabase.from("gmail_connections").delete().eq("user_id", userId);
}

export async function assertGmailAccess(gmail: gmail_v1.Gmail) {
  await gmail.users.drafts.list({ userId: "me", maxResults: 1 });
}

export function createRawEmail(input: {
  to: string;
  from?: string | null;
  subject: string;
  body: string;
}) {
  const to = String(input.to || "").replace(/[\r\n]/g, "").trim();
  if (!to.includes("@")) {
    throw new Error(`Invalid recipient: ${input.to || "(empty)"}`);
  }

  const subject = encodeSubject(String(input.subject || "(no subject)"));
  const body = String(input.body || "");
  const from = input.from
    ? String(input.from).replace(/[\r\n]/g, "").trim()
    : "";

  const str = [
    'Content-Type: text/plain; charset="UTF-8"\n',
    "MIME-Version: 1.0\n",
    "Content-Transfer-Encoding: 7bit\n",
    from ? `From: ${from}\n` : "",
    `to: ${to}\n`,
    `subject: ${subject}\n\n`,
    body,
  ].join("");

  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function createGmailDraft(input: {
  gmail: gmail_v1.Gmail;
  to: string;
  from?: string | null;
  subject: string;
  body: string;
}) {
  const raw = createRawEmail({
    to: input.to,
    from: input.from,
    subject: input.subject,
    body: input.body,
  });

  const res = await input.gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw,
      },
    },
  });

  return {
    id: res.data.id ?? res.data.message?.id ?? null,
  };
}

export async function sendGmailDraftWithRetry(
  gmail: gmail_v1.Gmail,
  draftId: string,
  attempts = 4,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const sent = await gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: draftId },
      });

      return {
        id: sent.data.id ?? null,
      };
    } catch (error) {
      lastError = error;

      if (isGmailAuthError(error)) {
        throw error;
      }

      if (isGmailRateLimitError(error) && attempt < attempts) {
        // 1s, 2s, 4s backoff
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      // Transient 5xx
      if (isTransientGmailError(error) && attempt < attempts) {
        await sleep(500 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export function getGmailErrorMessage(error: unknown) {
  if (error instanceof Error && !("response" in error) && error.message) {
    if (!error.message.toLowerCase().includes("request failed")) {
      return error.message;
    }
  }

  if (!error || typeof error !== "object") {
    return "Gmail draft creation failed.";
  }

  const err = error as {
    message?: string;
    code?: number | string;
    errors?: Array<{ message?: string; reason?: string; domain?: string }>;
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
          errors?: Array<{ message?: string; reason?: string; domain?: string }>;
        };
        error_description?: string;
      }
    | string
    | undefined;

  const blob = JSON.stringify(data ?? err.message ?? "").toLowerCase();

  if (blob.includes("invalid_grant")) {
    return (
      "invalid_grant: Gmail tokens are expired or revoked. " +
      "Disconnect Gmail, remove EmailFlow AI access at myaccount.google.com/permissions, " +
      "then Connect Gmail again. " +
      "If your Google Cloud app is in Testing mode, refresh tokens expire after 7 days."
    );
  }

  if (data && typeof data === "object" && data.error) {
    const parts = [
      data.error.message,
      data.error.errors?.[0]?.reason
        ? `reason=${data.error.errors[0].reason}`
        : null,
      data.error.errors?.[0]?.message &&
      data.error.errors[0].message !== data.error.message
        ? data.error.errors[0].message
        : null,
    ].filter(Boolean);

    if (parts.length) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(data.error).slice(0, 400);
    } catch {
      // continue
    }
  }

  if (typeof data === "string" && data.trim()) {
    return data.trim().slice(0, 400);
  }

  if (err.errors?.[0]?.message) {
    return err.errors[0].message;
  }

  if (err.message) {
    return err.message.replace(/^Request failed with status code \d+\s*/i, "").trim();
  }

  const status = err.response?.status ?? err.code;
  return `Gmail error${status ? ` (${status})` : ""}. Check Gmail API is enabled in Google Cloud and reconnect Gmail.`;
}

export function isGmailAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if (isGmailRateLimitError(error)) return false;

  const err = error as {
    code?: number | string;
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const status = err.response?.status ?? err.code;
  if (status === 401) return true;
  if (status === 403) {
    const message = `${err.message ?? ""} ${JSON.stringify(err.response?.data ?? "")}`.toLowerCase();
    // 403 rate limits are not auth failures
    if (
      message.includes("rate limit") ||
      message.includes("user-rate") ||
      message.includes("quota")
    ) {
      return false;
    }
    return true;
  }

  const message = `${err.message ?? ""} ${JSON.stringify(err.response?.data ?? "")}`.toLowerCase();
  return (
    message.includes("invalid_grant") ||
    message.includes("invalid credentials") ||
    message.includes("unauthorized") ||
    message.includes("insufficient permission") ||
    message.includes("access_denied") ||
    message.includes("accessnotconfigured")
  );
}

export function isGmailRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: number | string;
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const status = Number(err.response?.status ?? err.code);
  if (status === 429) return true;

  const message = `${err.message ?? ""} ${JSON.stringify(err.response?.data ?? "")}`.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("user-rate") ||
    message.includes("quota exceeded") ||
    message.includes("resource_exhausted")
  );
}

export function isTransientGmailError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: number | string;
    response?: { status?: number };
  };
  const status = Number(err.response?.status ?? err.code);
  return status >= 500 && status < 600;
}

function encodeSubject(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
