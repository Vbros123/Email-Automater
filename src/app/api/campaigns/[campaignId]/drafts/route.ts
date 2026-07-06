import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import { MAX_CAMPAIGN_RECIPIENTS, toPersonalizationContact } from "@/lib/campaigns";
import { createGmailClient, createRawEmail } from "@/lib/gmail/client";
import { personalizeTemplate } from "@/lib/personalization";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { draftCreateSchema } from "@/lib/validators";
import type { Contact, EmailTemplate } from "@/lib/types";

type Params = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`gmail:drafts:${auth.user.id}`, {
    limit: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Draft creation is rate limited. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 60) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = draftCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft request." }, { status: 400 });
  }

  const { campaignId } = await params;
  const { data: campaign } = await auth.supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", auth.user.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (campaign.selected_contact_ids.length > MAX_CAMPAIGN_RECIPIENTS) {
    return NextResponse.json(
      { error: `Campaigns are capped at ${MAX_CAMPAIGN_RECIPIENTS} recipients.` },
      { status: 400 },
    );
  }

  const [{ data: template }, { data: contacts }, { data: connection }] =
    await Promise.all([
      auth.supabase
        .from("templates")
        .select("*")
        .eq("id", campaign.template_id)
        .eq("user_id", auth.user.id)
        .single(),
      auth.supabase
        .from("contacts")
        .select("*")
        .eq("user_id", auth.user.id)
        .in("id", campaign.selected_contact_ids),
      auth.supabase
        .from("gmail_connections")
        .select("*")
        .eq("user_id", auth.user.id)
        .single(),
    ]);

  if (!template || !contacts?.length) {
    return NextResponse.json(
      { error: "Campaign template or contacts are missing." },
      { status: 400 },
    );
  }

  if (!connection) {
    return NextResponse.json(
      { error: "Connect Gmail before creating drafts." },
      { status: 400 },
    );
  }

  const typedTemplate = template as EmailTemplate;
  const typedContacts = contacts as Contact[];
  const gmail = createGmailClient(connection);
  const results = [];

  for (const contact of typedContacts) {
    const personalized = personalizeTemplate(
      typedTemplate,
      toPersonalizationContact(contact),
      {
        allowUnresolved: parsed.data.overrideUnresolvedVariables,
        unsubscribeFooter: campaign.unsubscribe_footer ?? undefined,
      },
    );

    if (personalized.missingVariables.length && !parsed.data.overrideUnresolvedVariables) {
      const detail = `Missing variables: ${personalized.missingVariables.join(", ")}`;
      results.push({ email: contact.email, status: "blocked", detail });
      await logFailure(auth.supabase, auth.user.id, campaign.id, contact.email, detail);
      continue;
    }

    try {
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: createRawEmail({
              to: contact.email,
              subject: personalized.subject,
              body: personalized.body,
            }),
          },
        },
      });

      await auth.supabase.from("campaign_recipients").upsert(
        {
          user_id: auth.user.id,
          campaign_id: campaign.id,
          contact_id: contact.id,
          email: contact.email,
          status: "draft_created",
          gmail_draft_id: draft.data.id,
          error_message: null,
        },
        { onConflict: "campaign_id,contact_id" },
      );

      await auth.supabase.from("email_activity").insert({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        recipient_email: contact.email,
        action: "draft_created",
        status: "success",
        detail: draft.data.id ?? null,
      });

      results.push({ email: contact.email, status: "draft_created", detail: draft.data.id });
    } catch {
      const detail = "Gmail draft creation failed.";
      results.push({ email: contact.email, status: "failed", detail });
      await logFailure(auth.supabase, auth.user.id, campaign.id, contact.email, detail);
    }
  }

  const successfulDrafts = results.filter((result) => result.status === "draft_created").length;

  await auth.supabase
    .from("campaigns")
    .update({ status: successfulDrafts ? "drafts_created" : "failed" })
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id);

  return NextResponse.json({ results, draftsCreated: successfulDrafts });
}

async function logFailure(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  userId: string,
  campaignId: string,
  email: string,
  detail: string,
) {
  if (!supabase) return;

  await supabase.from("email_activity").insert({
    user_id: userId,
    campaign_id: campaignId,
    recipient_email: email,
    action: "failed",
    status: "failed",
    detail,
  });
}
