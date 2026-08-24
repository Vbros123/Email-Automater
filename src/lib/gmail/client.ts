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

  client.setCredentials(tokens);

  // Resolve the real Gmail address (not the app login email).
  let googleEmail: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get();
    googleEmail = profile.data.email ?? null;
  } catch {
    googleEmail = null;
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

export async function getAccessToken(auth: GoogleOAuthClient) {
  const tokenResponse = await auth.getAccessToken();
  const token =
    typeof tokenResponse === "string"
      ? tokenResponse
      : tokenResponse?.token ?? auth.credentials.access_token;

  if (!token) {
    throw new Error("Could not obtain a Gmail access token. Reconnect Gmail in Settings.");
  }

  return token;
}

/**
 * Create a Gmail draft via REST so we control the payload and get full error bodies.
 */
export async function createGmailDraft(input: {
  accessToken: string;
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

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: { raw },
      }),
    },
  );

  const text = await response.text();
  let json: {
    id?: string;
    message?: { id?: string };
    error?: {
      message?: string;
      status?: string;
      code?: number;
      errors?: Array<{ message?: string; reason?: string }>;
    };
  } = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: { message: text || response.statusText } };
  }

  if (!response.ok) {
    const detail =
      json.error?.errors?.[0]?.message ||
      json.error?.message ||
      text ||
      response.statusText ||
      "Gmail draft creation failed.";

    const error = new Error(detail) as Error & {
      code?: number;
      response?: { status: number; data: unknown };
    };
    error.code = response.status;
    error.response = { status: response.status, data: json };
    throw error;
  }

  return {
    id: json.id ?? json.message?.id ?? null,
  };
}

export function createRawEmail(input: {
  to: string;
  from?: string | null;
  subject: string;
  body: string;
}) {
  const to = sanitizeHeader(input.to);
  if (!to.includes("@")) {
    throw new Error(`Invalid recipient address: ${input.to || "(empty)"}`);
  }

  const subject = encodeSubject(input.subject || "(no subject)");
  const body = (input.body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const from = input.from ? sanitizeHeader(input.from) : null;

  const lines = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].filter((line): line is string => line !== null);

  const message = lines.join("\r\n");

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

  apiMessage = apiMessage
    .replace(/^Request failed with status code \d+\s*/i, "")
    .replace(/^Bad Request:?\s*/i, "")
    .trim();

  if (!apiMessage || /^bad request$/i.test(apiMessage)) {
    apiMessage =
      "Gmail rejected the message. Reconnect Gmail in Settings, then try again with 1–2 contacts first.";
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
