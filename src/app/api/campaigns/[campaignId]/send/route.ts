import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import {
  assertGmailAccess,
  createGmailAuth,
  getGmailErrorMessage,
  isGmailAuthError,
  isGmailRateLimitError,
  persistGmailTokens,
  sendGmailDraftWithRetry,
} from "@/lib/gmail/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sendConfirmationSchema } from "@/lib/validators";

// Allow long batches (Pro plans honor this; Hobby may still hard-cap).
export const maxDuration = 300;

type Params = {
  params: Promise<{ campaignId: string }>;
};

/** Pace sends so Gmail user-rate limits don't kill the batch midway. */
const SEND_GAP_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`gmail:send:${auth.user.id}`, {
    limit: 20,
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
      {
        error: "No Gmail drafts are ready to send.",
        results: [],
        sentCount: 0,
        remainingCount: 0,
        failedCount: 0,
      },
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
  const ready = recipients.filter((recipient) => recipient.gmail_draft_id);

  type Outcome = {
    id: string;
    email: string;
    status: "sent" | "failed" | "pending";
    detail?: string;
    messageId: string | null;
  };

  const outcome: Outcome[] = [];
  let stoppedForAuth = false;

  // Sequential + paced — more reliable than concurrent for Gmail send quotas.
  for (let i = 0; i < ready.length; i++) {
    const recipient = ready[i];

    if (stoppedForAuth) {
      outcome.push({
        id: recipient.id,
        email: recipient.email,
        status: "pending",
        detail: "Left as draft — will send on next Send click.",
        messageId: null,
      });
      continue;
    }

    try {
      const sent = await sendGmailDraftWithRetry(
        gmail,
        recipient.gmail_draft_id as string,
      );

      outcome.push({
        id: recipient.id,
        email: recipient.email,
        status: "sent",
        detail: sent.id ?? undefined,
        messageId: sent.id,
      });

      if (i < ready.length - 1) {
        await sleep(SEND_GAP_MS);
      }
    } catch (error) {
      const detail = getGmailErrorMessage(error);

      if (isGmailAuthError(error)) {
        stoppedForAuth = true;
        outcome.push({
          id: recipient.id,
          email: recipient.email,
          status: "pending",
          detail: `${detail} Reconnect Gmail, then Send again for remaining drafts.`,
          messageId: null,
        });
        continue;
      }

      if (isGmailRateLimitError(error)) {
        // Keep as draft_created so the client can continue later.
        outcome.push({
          id: recipient.id,
          email: recipient.email,
          status: "pending",
          detail: `Rate limited: ${detail}. Remaining drafts stay ready to send.`,
          messageId: null,
        });

        // Mark the rest pending without hammering the API this request.
        for (let j = i + 1; j < ready.length; j++) {
          outcome.push({
            id: ready[j].id,
            email: ready[j].email,
            status: "pending",
            detail: "Left as draft — will send on next Send click.",
            messageId: null,
          });
        }
        break;
      }

      // Permanent failure for this recipient only; continue the rest.
      outcome.push({
        id: recipient.id,
        email: recipient.email,
        status: "failed",
        detail,
        messageId: null,
      });
    }
  }

  const sent = outcome.filter((item) => item.status === "sent");
  const failed = outcome.filter((item) => item.status === "failed");
  const pending = outcome.filter((item) => item.status === "pending");

  // Only update rows that actually changed status.
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

  // pending stays draft_created — no DB write needed

  if (sent.length || failed.length) {
    await auth.supabase.from("email_activity").insert(
      [...sent, ...failed].map((item) => ({
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
  const remainingCount = pending.length;
  const failedCount = failed.length;

  // Count anything still draft_created in DB for accurate remaining.
  const { count: dbRemaining } = await auth.supabase
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("user_id", auth.user.id)
    .eq("status", "draft_created");

  const remaining = dbRemaining ?? remainingCount;

  await auth.supabase
    .from("campaigns")
    .update({
      status: remaining > 0 ? "drafts_created" : sentCount ? "sent" : "failed",
    })
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id);

  const message =
    remaining > 0
      ? `Sent ${sentCount} email${sentCount === 1 ? "" : "s"}. ${remaining} draft${remaining === 1 ? "" : "s"} still waiting — click Send again to continue.`
      : failedCount
        ? `Sent ${sentCount} email${sentCount === 1 ? "" : "s"} (${failedCount} failed).`
        : `Sent ${sentCount} email${sentCount === 1 ? "" : "s"}.`;

  return NextResponse.json({
    results: outcome.map(({ email, status, detail }) => ({
      email,
      status: status === "pending" ? "draft_created" : status,
      detail,
    })),
    sentCount,
    remainingCount: remaining,
    failedCount,
    message,
  });
}
