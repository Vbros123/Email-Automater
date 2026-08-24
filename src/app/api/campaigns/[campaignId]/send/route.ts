import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import {
  assertGmailAccess,
  createGmailAuth,
  getGmailErrorMessage,
  isGmailAuthError,
  persistGmailTokens,
} from "@/lib/gmail/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sendConfirmationSchema } from "@/lib/validators";

export const maxDuration = 60;

type Params = {
  params: Promise<{ campaignId: string }>;
};

const GMAIL_CONCURRENCY = 5;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`gmail:send:${auth.user.id}`, {
    limit: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Sending is rate limited. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 60) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = sendConfirmationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Sending requires explicit confirmation and permission attestation." },
      { status: 400 },
    );
  }

  const { campaignId } = await params;
  const [{ data: campaign }, { data: recipients }, { data: connection }] =
    await Promise.all([
      auth.supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("user_id", auth.user.id)
        .single(),
      auth.supabase
        .from("campaign_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("user_id", auth.user.id)
        .eq("status", "draft_created"),
      auth.supabase
        .from("gmail_connections")
        .select("*")
        .eq("user_id", auth.user.id)
        .single(),
    ]);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (!connection) {
    return NextResponse.json({ error: "Connect Gmail before sending." }, { status: 400 });
  }

  if (!recipients?.length) {
    return NextResponse.json(
      { error: "No Gmail drafts are ready to send." },
      { status: 400 },
    );
  }

  let gmailAuth;
  try {
    gmailAuth = createGmailAuth(connection);
    await assertGmailAccess(gmailAuth.gmail);
  } catch (error) {
    return NextResponse.json(
      { error: getGmailErrorMessage(error) },
      { status: 401 },
    );
  }

  const { gmail, auth: oauthClient } = gmailAuth;
  let stoppedForAuth = false;

  const ready = recipients.filter((recipient) => recipient.gmail_draft_id);

  const outcome = await mapPool(ready, GMAIL_CONCURRENCY, async (recipient) => {
    if (stoppedForAuth) {
      return {
        id: recipient.id,
        email: recipient.email,
        status: "failed" as const,
        detail: "Skipped after Gmail auth failure.",
        messageId: null as string | null,
      };
    }

    try {
      const sent = await gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: recipient.gmail_draft_id },
      });

      return {
        id: recipient.id,
        email: recipient.email,
        status: "sent" as const,
        detail: sent.data.id ?? undefined,
        messageId: sent.data.id ?? null,
      };
    } catch (error) {
      if (isGmailAuthError(error)) {
        stoppedForAuth = true;
      }

      return {
        id: recipient.id,
        email: recipient.email,
        status: "failed" as const,
        detail: getGmailErrorMessage(error),
        messageId: null as string | null,
      };
    }
  });

  const sent = outcome.filter((item) => item.status === "sent");
  const failed = outcome.filter((item) => item.status === "failed");

  await Promise.all([
    ...sent.map((item) =>
      auth.supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          gmail_message_id: item.messageId,
          error_message: null,
        })
        .eq("id", item.id)
        .eq("user_id", auth.user.id),
    ),
    ...failed.map((item) =>
      auth.supabase
        .from("campaign_recipients")
        .update({
          status: "failed",
          error_message: item.detail ?? "Gmail send failed.",
        })
        .eq("id", item.id)
        .eq("user_id", auth.user.id),
    ),
  ]);

  if (outcome.length) {
    await auth.supabase.from("email_activity").insert(
      outcome.map((item) => ({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        recipient_email: item.email,
        action: item.status === "sent" ? "sent" : "failed",
        status: item.status === "sent" ? "success" : "failed",
        detail: item.detail ?? null,
      })),
    );
  }

  try {
    await persistGmailTokens(auth.supabase, auth.user.id, oauthClient);
  } catch {
    // best-effort
  }

  const sentCount = sent.length;

  await auth.supabase
    .from("campaigns")
    .update({ status: sentCount ? "sent" : "failed" })
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id);

  return NextResponse.json({
    results: outcome.map(({ email, status, detail }) => ({ email, status, detail })),
    sentCount,
  });
}
