import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import { createGmailClient } from "@/lib/gmail/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sendConfirmationSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`gmail:send:${auth.user.id}`, {
    limit: 2,
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

  const gmail = createGmailClient(connection);
  const results = [];

  for (const recipient of recipients) {
    if (!recipient.gmail_draft_id) {
      continue;
    }

    try {
      const sent = await gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: recipient.gmail_draft_id },
      });

      await auth.supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          gmail_message_id: sent.data.id ?? null,
          error_message: null,
        })
        .eq("id", recipient.id)
        .eq("user_id", auth.user.id);

      await auth.supabase.from("email_activity").insert({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        recipient_email: recipient.email,
        action: "sent",
        status: "success",
        detail: sent.data.id ?? null,
      });

      results.push({ email: recipient.email, status: "sent" });
    } catch {
      await auth.supabase
        .from("campaign_recipients")
        .update({
          status: "failed",
          error_message: "Gmail send failed.",
        })
        .eq("id", recipient.id)
        .eq("user_id", auth.user.id);

      results.push({ email: recipient.email, status: "failed" });
    }
  }

  const sentCount = results.filter((result) => result.status === "sent").length;

  await auth.supabase
    .from("campaigns")
    .update({ status: sentCount ? "sent" : "failed" })
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id);

  return NextResponse.json({ results, sentCount });
}
